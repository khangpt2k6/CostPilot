package com.costpilot.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceMemberRepository extends JpaRepository<WorkspaceMember, WorkspaceMember.Key> {

	// oldest first, so the default workspace is the one the person started in
	List<WorkspaceMember> findByUserIdOrderByCreatedAtAsc(UUID userId);

	List<WorkspaceMember> findByTenantIdOrderByCreatedAtAsc(UUID tenantId);

	Optional<WorkspaceMember> findByTenantIdAndUserId(UUID tenantId, UUID userId);

	long countByTenantIdAndRole(UUID tenantId, String role);
}
