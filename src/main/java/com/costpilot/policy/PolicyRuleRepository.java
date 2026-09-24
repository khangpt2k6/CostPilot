package com.costpilot.policy;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

// 4.1: rules belong to one tenant; every lookup is tenant-qualified.
public interface PolicyRuleRepository extends JpaRepository<PolicyRule, UUID> {

	Optional<PolicyRule> findByTenantIdAndScopeTypeAndScopeRefAndActiveTrue(String tenantId, String scopeType,
			String scopeRef);

	List<PolicyRule> findByTenantId(String tenantId);
}
