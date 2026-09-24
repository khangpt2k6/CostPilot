package com.costpilot.budget;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "budget")
public class Budget {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	// 4.1: owning tenant (by name, as the ledger stores it). Budgets never cross tenants.
	@Column(name = "tenant_id", nullable = false, columnDefinition = "text")
	private String tenantId;

	@Column(name = "scope_type", nullable = false, columnDefinition = "text")
	private String scopeType;

	@Column(name = "scope_ref", nullable = false, columnDefinition = "text")
	private String scopeRef;

	@Column(name = "limit_amount", nullable = false, precision = 18, scale = 9)
	private BigDecimal limitAmount;

	@Column(nullable = false, columnDefinition = "text")
	private String currency = "USD";

	@Column(nullable = false)
	private boolean active = true;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected Budget() {
	}

	public Budget(String tenantId, String scopeType, String scopeRef, BigDecimal limitAmount) {
		this.tenantId = tenantId;
		this.scopeType = scopeType;
		this.scopeRef = scopeRef;
		this.limitAmount = limitAmount;
	}

	// 9.1: admin CRUD mutators. Changing the limit or (de)activating a budget takes
	// effect at runtime once the caller refreshes the Redis counter (BudgetService).
	public void setLimitAmount(BigDecimal limitAmount) {
		this.limitAmount = limitAmount;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public UUID getId() {
		return id;
	}

	public String getTenantId() {
		return tenantId;
	}

	public String getScopeType() {
		return scopeType;
	}

	public String getScopeRef() {
		return scopeRef;
	}

	public BigDecimal getLimitAmount() {
		return limitAmount;
	}

	public String getCurrency() {
		return currency;
	}

	public boolean isActive() {
		return active;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
