package com.costpilot.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceInviteRepository extends JpaRepository<WorkspaceInvite, UUID> {

	Optional<WorkspaceInvite> findByTokenHash(String tokenHash);

	Optional<WorkspaceInvite> findByIdAndTenantId(UUID id, UUID tenantId);

	List<WorkspaceInvite> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
