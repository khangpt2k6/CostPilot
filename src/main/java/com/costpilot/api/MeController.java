package com.costpilot.api;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.costpilot.account.AccountService;
import com.costpilot.account.AppUser;
import com.costpilot.account.CurrentUser;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 4.2: who am I, and which workspaces can I switch between
@RestController
@RequestMapping("/api")
public class MeController {

	public record UserView(UUID id, String email, String displayName, String avatarUrl) {
	}

	public record WorkspaceView(UUID id, String slug, String name, String role) {

		static WorkspaceView of(AccountService.Membership m) {
			return new WorkspaceView(m.tenantId(), m.slug(), m.displayName(), m.role().dbValue());
		}
	}

	public record MeView(UserView user, List<WorkspaceView> workspaces) {
	}

	public record CreateWorkspaceRequest(@NotBlank @Size(max = 64) String name) {
	}

	private final AccountService accounts;

	public MeController(AccountService accounts) {
		this.accounts = accounts;
	}

	@GetMapping("/me")
	public MeView me() {
		return view(CurrentUser.require().userId());
	}

	@PostMapping("/workspaces")
	public WorkspaceView create(@Valid @RequestBody CreateWorkspaceRequest request) {
		return WorkspaceView.of(accounts.createWorkspace(CurrentUser.require().userId(), request.name()));
	}

	MeView view(UUID userId) {
		AppUser user = accounts.user(userId).orElseThrow(CurrentUser.NotAUserException::new);
		return new MeView(new UserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl()),
				accounts.memberships(userId).stream().map(WorkspaceView::of).toList());
	}
}
