package com.costpilot.api;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.costpilot.security.ApiKey;
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
@RestController
@RequestMapping("/admin/keys")
public class AdminKeyController {

	private static final SecureRandom RANDOM = new SecureRandom();

	private final ApiKeyRepository apiKeys;
	private final ApiKeyHasher hasher;
	private final TeamRepository teams;
	private final ProjectRepository projects;

	public AdminKeyController(ApiKeyRepository apiKeys, ApiKeyHasher hasher, TeamRepository teams,
			ProjectRepository projects) {
		this.apiKeys = apiKeys;
		this.hasher = hasher;
		this.teams = teams;
		this.projects = projects;
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

	@PostMapping
	public MintResponse mint(@RequestBody MintRequest request) {
		AuthenticatedPrincipal actor = CurrentPrincipal.require();
		Team team = request.teamId() == null ? null : teams.findById(request.teamId()).orElse(null);
		if (team == null || !team.getTenantId().equals(actor.tenantUuid())) {
			// a foreign team reads the same as a missing one, so ids can't be probed
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "team not in your tenant");
		}
		if (request.projectId() != null) {
			Project project = projects.findById(request.projectId()).orElse(null);
			if (project == null || !project.getTeamId().equals(team.getId())) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project does not belong to team");
			}
		}
		String rawKey = generateKey();
		ApiKey key = new ApiKey(request.teamId(), request.projectId(), hasher.hash(rawKey),
				request.name() != null ? request.name() : "minted", request.admin());
		ApiKey saved = apiKeys.save(key);
		return new MintResponse(saved.getId(), rawKey, saved.getName(), saved.isAdmin());
	}

	private static String generateKey() {
		byte[] bytes = new byte[24];
		RANDOM.nextBytes(bytes);
		return "cp_live_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}
}
