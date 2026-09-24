package com.costpilot.admin;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminAuditRepository extends JpaRepository<AdminAudit, UUID> {

	List<AdminAudit> findByActorOrderByCreatedAtDesc(String actor);

	// 4.2: the workspace activity feed
	Page<AdminAudit> findByTenantId(String tenantId, Pageable pageable);

	List<AdminAudit> findByTargetTypeAndTargetRefOrderByCreatedAtDesc(String targetType, String targetRef);
}
