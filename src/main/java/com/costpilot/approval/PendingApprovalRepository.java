package com.costpilot.approval;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PendingApprovalRepository extends JpaRepository<PendingApproval, UUID> {

	// 8.2 race guard: claim the pending -> terminal transition in ONE conditional UPDATE.
	// Returns 1 for the writer that won and 0 for anyone racing behind it (a concurrent
	// approve / reject / expire finds the row already decided). The row lock the UPDATE
	// takes also parks a racing writer until the winner commits, so it cannot read stale
	// "pending" state in between.
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update PendingApproval p
			   set p.state = :terminal, p.decidedBy = :decidedBy,
			       p.decisionReason = :reason, p.decidedAt = :decidedAt
			 where p.id = :id and p.state = :pending
			""")
	int decideIfPending(@Param("id") UUID id, @Param("terminal") PendingApproval.State terminal,
			@Param("decidedBy") String decidedBy, @Param("reason") String reason,
			@Param("decidedAt") Instant decidedAt, @Param("pending") PendingApproval.State pending);

	// list-pending for the approvals API (9.2), newest first
	List<PendingApproval> findByStateOrderByCreatedAtDesc(PendingApproval.State state);

	// 4.1: tenant-scoped list - an admin only ever sees its own tenant's pending requests
	List<PendingApproval> findByTenantIdAndStateOrderByCreatedAtDesc(String tenantId, PendingApproval.State state);

	// 4.1 isolation: fetch a specific pending request only within the caller's tenant
	Optional<PendingApproval> findByIdAndTenantId(UUID id, String tenantId);

	// the expiry sweep: pending rows past their TTL
	List<PendingApproval> findByStateAndExpiresAtBefore(PendingApproval.State state, Instant cutoff);
}
