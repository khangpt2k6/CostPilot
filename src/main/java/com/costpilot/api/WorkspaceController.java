package com.costpilot.api;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.costpilot.account.CurrentUser;
import com.costpilot.account.SessionUser;
import com.costpilot.account.WorkspaceRole;
import com.costpilot.account.WorkspaceService;
import com.costpilot.security.AuthenticatedPrincipal;
import com.costpilot.security.CurrentPrincipal;
import com.costpilot.tenancy.Project;
import com.costpilot.tenancy.ProjectRepository;
import com.costpilot.tenancy.Team;
import com.costpilot.tenancy.TeamRepository;
import com.costpilot.tenancy.Tenant;
import com.costpilot.tenancy.TenantRepository;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 4.2: the current workspace - its name, people, invites, teams and projects. Reads are open
 * to every member; writes need owner/admin (SecurityConfig), with the finer membership rules
 * in {@link WorkspaceService}. Always scoped to the caller's own tenant.
 */
@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {

	// team/project names become X-Team-ID / budget refs, so keep them header- and URL-safe
	private static final String NAME_PATTERN = "^[a-z0-9][a-z0-9_-]{0,62}$";

	public record WorkspaceInfo(UUID id, String slug, String name) {
	}

	public record RenameRequest(@NotBlank @Size(max = 64) String name) {
	}

	public record RoleRequest(@NotNull String role) {
	}

	public record InviteRequest(String role) {
	}

	public record InviteCreated(WorkspaceService.InviteView invite, String token, String url) {
	}

	public record ProjectView(UUID id, String name) {
	}

	public record TeamView(UUID id, String name, List<ProjectView> projects) {
	}

	public record NameRequest(@NotBlank @Pattern(regexp = NAME_PATTERN,
			message = "lowercase letters, digits, - and _ only") String name) {
	}

	private final WorkspaceService workspaces;
	private final TenantRepository tenants;
	private final TeamRepository teams;
	private final ProjectRepository projects;
	private final String webBaseUrl;

	public WorkspaceController(WorkspaceService workspaces, TenantRepository tenants, TeamRepository teams,
			ProjectRepository projects, @Value("${costpilot.web.base-url:}") String webBaseUrl) {
		this.workspaces = workspaces;
		this.tenants = tenants;
		this.teams = teams;
		this.projects = projects;
		this.webBaseUrl = webBaseUrl == null ? "" : webBaseUrl.replaceAll("/$", "");
	}

	@GetMapping
	public WorkspaceInfo current() {
		Tenant tenant = tenant();
		return new WorkspaceInfo(tenant.getId(), tenant.getName(), tenant.getDisplayName());
	}

	@PatchMapping
	public WorkspaceInfo rename(@Valid @RequestBody RenameRequest request) {
		Tenant tenant = tenant();
		tenant.setDisplayName(request.name().trim());
		tenants.save(tenant);
		return new WorkspaceInfo(tenant.getId(), tenant.getName(), tenant.getDisplayName());
	}

	@GetMapping("/members")
	public List<WorkspaceService.MemberView> members() {
		return workspaces.members(tenantId());
	}

	@PatchMapping("/members/{userId}")
	public WorkspaceService.MemberView changeRole(@PathVariable UUID userId, @Valid @RequestBody RoleRequest request) {
		return workspaces.changeRole(tenantId(), CurrentUser.require().userId(), userId, parseRole(request.role()));
	}

	@DeleteMapping("/members/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void remove(@PathVariable UUID userId) {
		workspaces.removeMember(tenantId(), CurrentUser.require().userId(), userId);
	}

	@GetMapping("/invites")
	public List<WorkspaceService.InviteView> invites() {
		return workspaces.invites(tenantId());
	}

	@PostMapping("/invites")
	public InviteCreated invite(@RequestBody(required = false) InviteRequest request) {
		WorkspaceRole role = request == null || request.role() == null ? WorkspaceRole.MEMBER
				: parseRole(request.role());
		// an admin API key may create invites too; then there is no person to credit
		UUID createdBy = CurrentUser.get().map(SessionUser::userId).orElse(null);
		WorkspaceService.CreatedInvite created = workspaces.createInvite(tenantId(), createdBy, role);
		return new InviteCreated(created.invite(), created.token(), webBaseUrl + "/invite/" + created.token());
	}

	@DeleteMapping("/invites/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void revokeInvite(@PathVariable UUID id) {
		workspaces.revokeInvite(tenantId(), id);
	}

	@GetMapping("/teams")
	public List<TeamView> teams() {
		return teams.findByTenantIdOrderByNameAsc(tenantId()).stream()
				.map(t -> new TeamView(t.getId(), t.getName(), projects.findByTeamIdOrderByNameAsc(t.getId()).stream()
						.map(p -> new ProjectView(p.getId(), p.getName()))
						.sorted(Comparator.comparing(ProjectView::name))
						.toList()))
				.toList();
	}

	@PostMapping("/teams")
	@ResponseStatus(HttpStatus.CREATED)
	public TeamView createTeam(@Valid @RequestBody NameRequest request) {
		try {
			Team team = teams.saveAndFlush(new Team(tenantId(), request.name()));
			return new TeamView(team.getId(), team.getName(), List.of());
		} catch (DataIntegrityViolationException duplicate) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "team already exists");
		}
	}

	@PostMapping("/teams/{teamId}/projects")
	@ResponseStatus(HttpStatus.CREATED)
	public ProjectView createProject(@PathVariable UUID teamId, @Valid @RequestBody NameRequest request) {
		Team team = teams.findById(teamId)
				.filter(t -> t.getTenantId().equals(tenantId()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "team not found"));
		try {
			Project project = projects.saveAndFlush(new Project(team.getId(), request.name()));
			return new ProjectView(project.getId(), project.getName());
		} catch (DataIntegrityViolationException duplicate) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "project already exists");
		}
	}

	private static UUID tenantId() {
		AuthenticatedPrincipal principal = CurrentPrincipal.require();
		return principal.tenantUuid();
	}

	private Tenant tenant() {
		return tenants.findById(tenantId()).orElseThrow();
	}

	private static WorkspaceRole parseRole(String role) {
		try {
			return WorkspaceRole.fromDbValue(role);
		} catch (IllegalArgumentException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "role must be owner, admin or member");
		}
	}
}
