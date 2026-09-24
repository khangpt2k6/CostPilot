package com.costpilot.approval;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PendingApprovalRepository extends JpaRepository<PendingApproval, UUID> {

	// list-pending for the approvals API (9.2), newest first
	List<PendingApproval> findByStateOrderByCreatedAtDesc(PendingApproval.State state);

	// 4.1: tenant-scoped list - an admin only ever sees its own tenant's pending requests
	List<PendingApproval> findByTenantIdAndStateOrderByCreatedAtDesc(String tenantId, PendingApproval.State state);

	// 4.1 isolation: fetch a specific pending request only within the caller's tenant
	Optional<PendingApproval> findByIdAndTenantId(UUID id, String tenantId);

	// the expiry sweep: pending rows past their TTL
	List<PendingApproval> findByStateAndExpiresAtBefore(PendingApproval.State state, Instant cutoff);
}
