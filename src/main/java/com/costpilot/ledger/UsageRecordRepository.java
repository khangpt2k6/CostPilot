package com.costpilot.ledger;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsageRecordRepository extends JpaRepository<UsageRecord, UUID> {

	Optional<UsageRecord> findByIdempotencyKey(String idempotencyKey);

	boolean existsByIdempotencyKey(String idempotencyKey);

	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u")
	BigDecimal totalCost();

	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u where u.tenantId = :ref")
	BigDecimal totalCostForTenant(@Param("ref") String ref);

	// 4.1: team/project/model names are only unique inside a tenant, so every scoped
	// total carries the tenant predicate
	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u where u.tenantId = :tenant and u.teamId = :ref")
	BigDecimal totalCostForTeam(@Param("tenant") String tenant, @Param("ref") String ref);

	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u where u.tenantId = :tenant and u.projectId = :ref")
	BigDecimal totalCostForProject(@Param("tenant") String tenant, @Param("ref") String ref);

	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u where u.tenantId = :tenant and u.model = :ref")
	BigDecimal totalCostForModel(@Param("tenant") String tenant, @Param("ref") String ref);

	// 7.3: total routing savings recorded in the ledger, for reconciliation against the
	// accumulated savings metric over a fixed window. Nulls (savings unknown) are ignored.
	@Query("select coalesce(sum(u.savingsNanos), 0) from UsageRecord u")
	long totalSavingsNanos();

	@Query("select coalesce(sum(u.savingsNanos), 0) from UsageRecord u "
			+ "where u.tenantId = :tenant and u.createdAt >= :from and u.createdAt < :to")
	long totalSavingsNanosBetween(@Param("tenant") String tenant,
			@Param("from") java.time.Instant from, @Param("to") java.time.Instant to);

	// 6.1/7.3: team-scoped routing savings over a window - a non-admin sees only its own.
	@Query("select coalesce(sum(u.savingsNanos), 0) from UsageRecord u "
			+ "where u.tenantId = :tenant and u.teamId = :team and u.createdAt >= :from and u.createdAt < :to")
	long totalSavingsNanosForTeamBetween(@Param("tenant") String tenant, @Param("team") String team,
			@Param("from") java.time.Instant from, @Param("to") java.time.Instant to);

	// 5.4 reconciliation: ledger cost sum over a half-open window [from, to). Compared
	// against the ClickHouse total for the same window to prove the OLAP pipeline is exact.
	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u "
			+ "where u.tenantId = :tenant and u.createdAt >= :from and u.createdAt < :to")
	BigDecimal totalCostBetween(@Param("tenant") String tenant,
			@Param("from") java.time.Instant from, @Param("to") java.time.Instant to);

	long countByTenantIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(String tenantId,
			java.time.Instant from, java.time.Instant to);

	// 6.1: team-scoped reconciliation - a non-admin reconciles only its own team's window.
	@Query("select coalesce(sum(u.cost), 0) from UsageRecord u "
			+ "where u.tenantId = :tenant and u.teamId = :team and u.createdAt >= :from and u.createdAt < :to")
	BigDecimal totalCostForTeamBetween(@Param("tenant") String tenant, @Param("team") String team,
			@Param("from") java.time.Instant from, @Param("to") java.time.Instant to);

	long countByTenantIdAndTeamIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
			String tenantId, String teamId, java.time.Instant from, java.time.Instant to);
}
