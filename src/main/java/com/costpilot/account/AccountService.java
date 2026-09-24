package com.costpilot.account;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.costpilot.tenancy.Project;
import com.costpilot.tenancy.ProjectRepository;
import com.costpilot.tenancy.Team;
import com.costpilot.tenancy.TeamRepository;
import com.costpilot.tenancy.Tenant;
import com.costpilot.tenancy.TenantRepository;

/**
 * 4.2: accounts and workspaces. First login creates the person and a workspace they own,
 * with a {@code default} team and project so a key can be minted straight away.
 */
@Service
public class AccountService {

	private static final Logger log = LoggerFactory.getLogger(AccountService.class);
	private static final SecureRandom RANDOM = new SecureRandom();
	private static final char[] SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789".toCharArray();

	/** What a provider tells us about the person on login. */
	public record ExternalProfile(String provider, String subject, String email, String displayName,
			String avatarUrl) {
	}

	/** One workspace the person belongs to. {@code slug} is the tenant name the ledger stores. */
	public record Membership(UUID tenantId, String slug, String displayName, WorkspaceRole role) {
	}

	private final AppUserRepository users;
	private final UserIdentityRepository identities;
	private final WorkspaceMemberRepository members;
	private final TenantRepository tenants;
	private final TeamRepository teams;
	private final ProjectRepository projects;
	private final String demoTenant;

	public AccountService(AppUserRepository users, UserIdentityRepository identities,
			WorkspaceMemberRepository members, TenantRepository tenants, TeamRepository teams,
			ProjectRepository projects, @Value("${costpilot.auth.demo-tenant:}") String demoTenant) {
		this.users = users;
		this.identities = identities;
		this.members = members;
		this.tenants = tenants;
		this.teams = teams;
		this.projects = projects;
		this.demoTenant = demoTenant;
	}

	/**
	 * Find the person behind this external login, or create them (plus their first
	 * workspace). Called on every successful login, so it also refreshes the profile.
	 */
	@Transactional
	public AppUser loginOrRegister(ExternalProfile profile) {
		Optional<UserIdentity> existing = identities.findByProviderAndSubject(profile.provider(), profile.subject());
		if (existing.isPresent()) {
			AppUser user = users.findById(existing.get().getUserId()).orElseThrow();
			user.touchLogin(profile.email(), profile.displayName(), profile.avatarUrl());
			return user;
		}
		String name = profile.displayName() != null && !profile.displayName().isBlank()
				? profile.displayName()
				: fallbackName(profile.email());
		AppUser user = users.save(new AppUser(profile.email(), name, profile.avatarUrl()));
		identities.save(new UserIdentity(user.getId(), profile.provider(), profile.subject()));
		createWorkspace(user.getId(), name + "'s workspace");
		joinDemoTenant(user.getId());
		log.info("account registered user={} provider={}", user.getId(), profile.provider());
		return user;
	}

	/** New workspace owned by {@code ownerId}, seeded with a default team + project. */
	@Transactional
	public Membership createWorkspace(UUID ownerId, String displayName) {
		String clean = displayName == null || displayName.isBlank() ? "workspace" : displayName.trim();
		Tenant tenant = tenants.save(new Tenant(uniqueSlug(clean), clean));
		Team team = teams.save(new Team(tenant.getId(), "default"));
		projects.save(new Project(team.getId(), "default"));
		members.save(new WorkspaceMember(tenant.getId(), ownerId, WorkspaceRole.OWNER));
		log.info("workspace created tenant={} owner={}", tenant.getName(), ownerId);
		return new Membership(tenant.getId(), tenant.getName(), tenant.getDisplayName(), WorkspaceRole.OWNER);
	}

	@Transactional(readOnly = true)
	public List<Membership> memberships(UUID userId) {
		return members.findByUserIdOrderByCreatedAtAsc(userId).stream()
				.map(m -> tenants.findById(m.getTenantId())
						.map(t -> new Membership(t.getId(), t.getName(), t.getDisplayName(), m.getRole())))
				.flatMap(Optional::stream)
				.toList();
	}

	@Transactional(readOnly = true)
	public Optional<Membership> membership(UUID userId, UUID tenantId) {
		return members.findByTenantIdAndUserId(tenantId, userId)
				.flatMap(m -> tenants.findById(tenantId)
						.map(t -> new Membership(t.getId(), t.getName(), t.getDisplayName(), m.getRole())));
	}

	@Transactional(readOnly = true)
	public Optional<AppUser> user(UUID userId) {
		return users.findById(userId);
	}

	/**
	 * Localhost convenience: make every new person an admin of the seeded demo tenant so the
	 * dashboard has data on first run. Off unless {@code costpilot.auth.demo-tenant} is set.
	 */
	private void joinDemoTenant(UUID userId) {
		if (demoTenant == null || demoTenant.isBlank()) {
			return;
		}
		tenants.findByName(demoTenant).ifPresent(t -> {
			if (members.findByTenantIdAndUserId(t.getId(), userId).isEmpty()) {
				members.save(new WorkspaceMember(t.getId(), userId, WorkspaceRole.ADMIN));
			}
		});
	}

	// ledger rows carry the tenant name, so it must be unique and stable; a random suffix
	// keeps two "Acme" workspaces apart without a round of retries in the common case
	private String uniqueSlug(String displayName) {
		String base = slugify(displayName);
		for (int attempt = 0; attempt < 5; attempt++) {
			String candidate = base + "-" + suffix();
			if (tenants.findByName(candidate).isEmpty()) {
				return candidate;
			}
		}
		return base + "-" + UUID.randomUUID();
	}

	static String slugify(String input) {
		String ascii = Normalizer.normalize(input, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
		String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
		if (slug.isEmpty()) {
			slug = "workspace";
		}
		return slug.length() > 32 ? slug.substring(0, 32).replaceAll("-$", "") : slug;
	}

	private static String suffix() {
		StringBuilder sb = new StringBuilder(6);
		for (int i = 0; i < 6; i++) {
			sb.append(SUFFIX_ALPHABET[RANDOM.nextInt(SUFFIX_ALPHABET.length)]);
		}
		return sb.toString();
	}

	private static String fallbackName(String email) {
		if (email != null && email.contains("@")) {
			return email.substring(0, email.indexOf('@'));
		}
		return "New user";
	}
}
