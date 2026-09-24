package com.costpilot.account;

import java.util.Locale;

/**
 * 4.2: what a person may do inside one workspace. Owner and admin both manage governance
 * (budgets, policies, approvals, keys, members); only an owner can grant or take away
 * ownership. A member reads everything in the workspace but changes nothing.
 */
public enum WorkspaceRole {

	OWNER, ADMIN, MEMBER;

	public String dbValue() {
		return name().toLowerCase(Locale.ROOT);
	}

	public static WorkspaceRole fromDbValue(String value) {
		return valueOf(value.toUpperCase(Locale.ROOT));
	}

	public boolean canAdminister() {
		return this != MEMBER;
	}
}
