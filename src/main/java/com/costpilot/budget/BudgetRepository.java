package com.costpilot.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

// 4.1: every lookup is tenant-qualified - a scope ref only means something inside a tenant.
public interface BudgetRepository extends JpaRepository<Budget, UUID> {

	Optional<Budget> findByTenantIdAndScopeTypeAndScopeRefAndActiveTrue(String tenantId, String scopeType,
			String scopeRef);

	// admin CRUD (9.1): find regardless of active flag, to update or reactivate a budget
	Optional<Budget> findByTenantIdAndScopeTypeAndScopeRef(String tenantId, String scopeType, String scopeRef);

	List<Budget> findByTenantId(String tenantId);
}
