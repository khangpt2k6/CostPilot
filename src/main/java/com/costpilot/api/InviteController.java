package com.costpilot.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.costpilot.account.CurrentUser;
import com.costpilot.account.WorkspaceService;

// 4.2: the receiving end of an invite link. Preview is public; accepting needs a login.
@RestController
@RequestMapping("/api/invites")
public class InviteController {

	private final WorkspaceService workspaces;

	public InviteController(WorkspaceService workspaces) {
		this.workspaces = workspaces;
	}

	@GetMapping("/{token}")
	public WorkspaceService.InvitePreview preview(@PathVariable String token) {
		return workspaces.preview(token);
	}

	@PostMapping("/{token}/accept")
	public MeController.WorkspaceView accept(@PathVariable String token) {
		return MeController.WorkspaceView.of(workspaces.accept(token, CurrentUser.require().userId()));
	}
}
