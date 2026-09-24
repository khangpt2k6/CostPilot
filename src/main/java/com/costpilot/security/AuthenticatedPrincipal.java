package com.costpilot.security;

import java.util.UUID;

/**
 * 6.1: the resolved identity behind an authenticated request.
 *
 * Names (tenantId/teamId/projectId) are the string identities used throughout the ledger,
 * budget and policy path - resolved from the api_key's team_id/project_id UUIDs by joining
 * the tenant/team/project tables. teamUuid is kept for exact per-team isolation predicates.
 * admin=true is a tenant-admin key that may read across teams; otherwise the request is
 * force-scoped to its own team on the admin/analytics surfaces.
 * 4.1: tenantUuid pins writes that take raw ids (key minting) to the caller's own tenant.
 * 4.2: actor is who shows up in the admin activity log ("key:<name>" or "user:<email>").
 * A console session has no team (teamId null) and reads workspace-wide.
 */
public record AuthenticatedPrincipal(
		String tenantId,
		String teamId,
		String projectId,
		UUID teamUuid,
		boolean admin,
		UUID tenantUuid,
		String actor) {

	/**
	 * The team reads must be confined to, or null for workspace-wide. Only a non-admin team
	 * key is confined; admins and console sessions (no team) see the whole tenant.
	 */
	public String teamScope() {
		return admin || teamId == null ? null : teamId;
	}
}
