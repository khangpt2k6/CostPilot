package com.costpilot.account;

// 4.2: a membership change that would break a workspace rule (e.g. removing the last owner)
public class WorkspaceRuleException extends RuntimeException {

	public WorkspaceRuleException(String message) {
		super(message);
	}
}
