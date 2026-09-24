package com.costpilot.account;

// 4.2: the invite exists but can no longer be used (accepted, revoked or expired)
public class InviteUnavailableException extends RuntimeException {

	public InviteUnavailableException(WorkspaceInvite.Status status) {
		super("invite is " + status.name().toLowerCase(java.util.Locale.ROOT));
	}
}
