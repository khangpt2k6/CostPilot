package com.costpilot.api;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.costpilot.admin.AdminAuditService;
import com.costpilot.security.ApiKey;
import com.costpilot.security.ApiKeyAuthService;
import com.costpilot.security.ApiKeyHasher;
import com.costpilot.security.ApiKeyRepository;
import com.costpilot.security.AuthenticatedPrincipal;
import com.costpilot.security.CurrentPrincipal;
import com.costpilot.tenancy.Project;
import com.costpilot.tenancy.ProjectRepository;
import com.costpilot.tenancy.Team;
import com.costpilot.tenancy.TeamRepository;

import jakarta.validation.constraints.NotNull;

// 6.1: mint API keys. ROLE_ADMIN only (enforced in SecurityConfig on /admin/keys/**).
// The raw key is generated here, returned to the caller EXACTLY ONCE, and only its
// HMAC-SHA256 hash is persisted - the plaintext is never stored or recoverable.
// 4.1: the team (and project, when given) must belong to the caller's own tenant. Before
// this an admin key of one tenant could mint a working key for any team on the instance.
// 4.2: list (no secrets, just a prefix) and revoke, for the console's key page.
@RestController
@RequestMapping("/admin/keys")
public class AdminKeyController {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final int PREFIX_LENGTH = 12;

	private final ApiKeyRepository apiKeys;
	private final ApiKeyHasher hasher;
	private final ApiKeyAuthService authService;
	private final TeamRepository teams;
	private final ProjectRepository projects;
	private final AdminAuditService adminAudit;

	public AdminKeyController(ApiKeyRepository apiKeys, ApiKeyHasher hasher, ApiKeyAuthService authService,
			TeamRepository teams, ProjectRepository projects, AdminAuditService adminAudit) {
		this.apiKeys = apiKeys;
		this.hasher = hasher;
		this.authService = authService;
		this.teams = teams;
		this.projects = projects;
		this.adminAudit = adminAudit;
	}

	public record MintRequest(
			@NotNull UUID teamId,
			UUID projectId,
			String name,
			boolean admin) {
	}

	// key is present ONLY in this response - it is never stored in plaintext
	public record MintResponse(UUID id, String key, String name, boolean admin) {
	}

	public record KeyView(UUID id, String name, String prefix, UUID teamId, String team, UUID projectId,
			String project, boolean admin, Instant createdAt, Instant revokedAt) {
	}

	@GetMapping
	public List<KeyView> list() {
		Map<UUID, Team> byId = teams.findByTenantIdOrderByNameAsc(CurrentPrincipal.require().tenantUuid()).stream()
				.collect(Collectors.toMap(Team::getId, Function.identity()));
		return apiKeys.findByTeamIdInOrderByCreatedAtDesc(byId.keySet()).stream()
				.map(k -> new KeyView(k.getId(), k.getName(), k.getKeyPrefix(), k.getTeamId(),
						byId.get(k.getTeamId()).getName(), k.getProjectId(),
						k.getProjectId() == null ? null
								: projects.findById(k.getProjectId()).map(Project::getName).orElse(null),
						k.isAdmin(), k.getCreatedAt(), k.getRevokedAt()))
				.toList();
	}

	@PostMapping
	public MintResponse mint(@RequestBody MintRequest request) {
		AuthenticatedPrincipal actor = CurrentPrincipal.require();
		Team team = requireOwnTeam(request.teamId(), actor);
		if (request.projectId() != null) {
			Project project = projects.findById(request.projectId()).orElse(null);
			if (project == null || !project.getTeamId().equals(team.getId())) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project does not belong to team");
			}
		}
		String rawKey = generateKey();
		ApiKey key = new ApiKey(request.teamId(), request.projectId(), hasher.hash(rawKey),
				request.name() != null && !request.name().isBlank() ? request.name() : "minted", request.admin());
		key.setKeyPrefix(rawKey.substring(0, PREFIX_LENGTH));
		ApiKey saved = apiKeys.save(key);
		adminAudit.record(actor.tenantId(), actor.actor(), "key.mint", "key", saved.getId().toString(), null,
				saved.getName() + (saved.isAdmin() ? " (admin)" : "") + " team=" + team.getName());
		return new MintResponse(saved.getId(), rawKey, saved.getName(), saved.isAdmin());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void revoke(@PathVariable UUID id) {
		AuthenticatedPrincipal actor = CurrentPrincipal.require();
		ApiKey key = apiKeys.findById(id)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "key not found"));
		// another tenant's key reads as missing
		teams.findById(key.getTeamId())
				.filter(t -> t.getTenantId().equals(actor.tenantUuid()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "key not found"));
		key.revoke();
		apiKeys.save(key);
		// this instance stops honoring it now; other instances within the 60s auth cache TTL
		authService.evict(key.getKeyHash());
		adminAudit.record(actor.tenantId(), actor.actor(), "key.revoke", "key", id.toString(), key.getName(), null);
	}

	private Team requireOwnTeam(UUID teamId, AuthenticatedPrincipal actor) {
		Team team = teamId == null ? null : teams.findById(teamId).orElse(null);
		if (team == null || !team.getTenantId().equals(actor.tenantUuid())) {
			// a foreign team reads the same as a missing one, so ids can't be probed
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "team not in your tenant");
		}
		return team;
	}

	private static String generateKey() {
		byte[] bytes = new byte[24];
		RANDOM.nextBytes(bytes);
		return "cp_live_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}
}
