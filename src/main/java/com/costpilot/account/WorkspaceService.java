package com.costpilot.account;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.costpilot.tenancy.Tenant;
import com.costpilot.tenancy.TenantRepository;

/**
 * 4.2: membership and invite rules for one workspace.
 *
 * <ul>
 * <li>A workspace always keeps at least one owner.</li>
 * <li>Only an owner can make someone an owner, or change/remove another owner.</li>
 * <li>Anyone may leave; admins may remove members and admins.</li>
 * <li>Invites are single use, expire after {@link #INVITE_TTL}, and never grant ownership.</li>
 * </ul>
 */
@Service
public class WorkspaceService {

	private static final Logger log = LoggerFactory.getLogger(WorkspaceService.class);
	static final Duration INVITE_TTL = Duration.ofDays(7);
	private static final SecureRandom RANDOM = new SecureRandom();

	public record MemberView(UUID userId, String email, String displayName, String avatarUrl, WorkspaceRole role,
			Instant joinedAt) {
	}

	public record InviteView(UUID id, WorkspaceRole role, String status, Instant createdAt, Instant expiresAt) {
	}

	/** The raw token is only ever returned here, at creation. */
	public record CreatedInvite(InviteView invite, String token) {
	}

	public record InvitePreview(String workspaceName, WorkspaceRole role, String status) {
	}

	private final WorkspaceMemberRepository members;
	private final WorkspaceInviteRepository invites;
	private final AppUserRepository users;
	private final TenantRepository tenants;
	private final AccountService accounts;
	private final Clock clock;

	public WorkspaceService(WorkspaceMemberRepository members, WorkspaceInviteRepository invites,
			AppUserRepository users, TenantRepository tenants, AccountService accounts,
			Optional<Clock> clock) {
		this.members = members;
		this.invites = invites;
		this.users = users;
		this.tenants = tenants;
		this.accounts = accounts;
		this.clock = clock.orElse(Clock.systemUTC());
	}

	@Transactional(readOnly = true)
	public List<MemberView> members(UUID tenantId) {
		return members.findByTenantIdOrderByCreatedAtAsc(tenantId).stream()
				.map(m -> users.findById(m.getUserId())
						.map(u -> new MemberView(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(),
								m.getRole(), m.getCreatedAt())))
				.flatMap(Optional::stream)
				.toList();
	}

	@Transactional
	public MemberView changeRole(UUID tenantId, UUID actorId, UUID targetId, WorkspaceRole newRole) {
		WorkspaceMember actor = requireMember(tenantId, actorId);
		WorkspaceMember target = requireMember(tenantId, targetId);
		if (!actor.getRole().canAdminister()) {
			throw new WorkspaceRuleException("only owners and admins can change roles");
		}
		boolean touchesOwnership = newRole == WorkspaceRole.OWNER || target.getRole() == WorkspaceRole.OWNER;
		if (touchesOwnership && actor.getRole() != WorkspaceRole.OWNER) {
			throw new WorkspaceRuleException("only an owner can grant or change ownership");
		}
		if (target.getRole() == WorkspaceRole.OWNER && newRole != WorkspaceRole.OWNER) {
			requireAnotherOwner(tenantId);
		}
		target.setRole(newRole);
		members.save(target);
		log.info("workspace role changed tenant={} user={} role={} by={}", tenantId, targetId, newRole, actorId);
		return view(target);
	}

	@Transactional
	public void removeMember(UUID tenantId, UUID actorId, UUID targetId) {
		WorkspaceMember actor = requireMember(tenantId, actorId);
		WorkspaceMember target = requireMember(tenantId, targetId);
		boolean leaving = actorId.equals(targetId);
		if (!leaving) {
			if (!actor.getRole().canAdminister()) {
				throw new WorkspaceRuleException("only owners and admins can remove people");
			}
			if (target.getRole() == WorkspaceRole.OWNER && actor.getRole() != WorkspaceRole.OWNER) {
				throw new WorkspaceRuleException("only an owner can remove an owner");
			}
		}
		if (target.getRole() == WorkspaceRole.OWNER) {
			requireAnotherOwner(tenantId);
		}
		members.delete(target);
		log.info("workspace member removed tenant={} user={} by={}", tenantId, targetId, actorId);
	}

	@Transactional
	public CreatedInvite createInvite(UUID tenantId, UUID createdBy, WorkspaceRole role) {
		if (role == WorkspaceRole.OWNER) {
			throw new WorkspaceRuleException("invites cannot grant ownership");
		}
		String token = newToken();
		Instant now = clock.instant();
		WorkspaceInvite invite = invites.save(new WorkspaceInvite(tenantId, hash(token), role, createdBy,
				now.plus(INVITE_TTL)));
		return new CreatedInvite(view(invite, now), token);
	}

	@Transactional(readOnly = true)
	public List<InviteView> invites(UUID tenantId) {
		Instant now = clock.instant();
		return invites.findByTenantIdOrderByCreatedAtDesc(tenantId).stream().map(i -> view(i, now)).toList();
	}

	@Transactional
	public void revokeInvite(UUID tenantId, UUID inviteId) {
		WorkspaceInvite invite = invites.findByIdAndTenantId(inviteId, tenantId)
				.orElseThrow(() -> new NoSuchElementException("invite not found"));
		invite.revoke(clock.instant());
		invites.save(invite);
	}

	@Transactional(readOnly = true)
	public InvitePreview preview(String token) {
		WorkspaceInvite invite = invites.findByTokenHash(hash(token))
				.orElseThrow(() -> new NoSuchElementException("invite not found"));
		String name = tenants.findById(invite.getTenantId()).map(Tenant::getDisplayName).orElse("workspace");
		return new InvitePreview(name, invite.getRole(), statusOf(invite, clock.instant()));
	}

	/**
	 * Join the invite's workspace. Joining a workspace you're already in keeps your current
	 * role (an invite never downgrades anyone) but still uses up the invite.
	 */
	@Transactional
	public AccountService.Membership accept(String token, UUID userId) {
		Instant now = clock.instant();
		WorkspaceInvite invite = invites.findByTokenHash(hash(token))
				.orElseThrow(() -> new NoSuchElementException("invite not found"));
		WorkspaceInvite.Status status = invite.status(now);
		if (status != WorkspaceInvite.Status.PENDING) {
			throw new InviteUnavailableException(status);
		}
		invite.accept(userId, now);
		invites.save(invite);
		if (members.findByTenantIdAndUserId(invite.getTenantId(), userId).isEmpty()) {
			members.save(new WorkspaceMember(invite.getTenantId(), userId, invite.getRole()));
		}
		log.info("invite accepted tenant={} user={} role={}", invite.getTenantId(), userId, invite.getRole());
		return accounts.membership(userId, invite.getTenantId()).orElseThrow();
	}

	private WorkspaceMember requireMember(UUID tenantId, UUID userId) {
		return members.findByTenantIdAndUserId(tenantId, userId)
				.orElseThrow(() -> new NoSuchElementException("not a member of this workspace"));
	}

	private void requireAnotherOwner(UUID tenantId) {
		if (members.countByTenantIdAndRole(tenantId, WorkspaceRole.OWNER.dbValue()) <= 1) {
			throw new WorkspaceRuleException("a workspace needs at least one owner");
		}
	}

	private MemberView view(WorkspaceMember m) {
		AppUser u = users.findById(m.getUserId()).orElseThrow();
		return new MemberView(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), m.getRole(),
				m.getCreatedAt());
	}

	private static InviteView view(WorkspaceInvite i, Instant now) {
		return new InviteView(i.getId(), i.getRole(), statusOf(i, now), i.getCreatedAt(), i.getExpiresAt());
	}

	private static String statusOf(WorkspaceInvite i, Instant now) {
		return i.status(now).name().toLowerCase(java.util.Locale.ROOT);
	}

	private static String newToken() {
		byte[] bytes = new byte[24];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	// invite tokens are 192-bit random, so a plain SHA-256 is enough (no pepper/slow hash)
	static String hash(String token) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
