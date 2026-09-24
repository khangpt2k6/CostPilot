package com.costpilot.account;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

// 4.2: a person's role in one workspace (tenant). Primary key is (tenant, user).
@Entity
@Table(name = "workspace_member")
@IdClass(WorkspaceMember.Key.class)
public class WorkspaceMember {

	@Id
	@Column(name = "tenant_id")
	private UUID tenantId;

	@Id
	@Column(name = "user_id")
	private UUID userId;

	@Column(nullable = false, columnDefinition = "text")
	private String role;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected WorkspaceMember() {
	}

	public WorkspaceMember(UUID tenantId, UUID userId, WorkspaceRole role) {
		this.tenantId = tenantId;
		this.userId = userId;
		this.role = role.dbValue();
	}

	public UUID getTenantId() {
		return tenantId;
	}

	public UUID getUserId() {
		return userId;
	}

	public WorkspaceRole getRole() {
		return WorkspaceRole.fromDbValue(role);
	}

	public void setRole(WorkspaceRole role) {
		this.role = role.dbValue();
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public static class Key implements Serializable {

		private UUID tenantId;
		private UUID userId;

		public Key() {
		}

		public Key(UUID tenantId, UUID userId) {
			this.tenantId = tenantId;
			this.userId = userId;
		}

		@Override
		public boolean equals(Object o) {
			return o instanceof Key k && Objects.equals(tenantId, k.tenantId) && Objects.equals(userId, k.userId);
		}

		@Override
		public int hashCode() {
			return Objects.hash(tenantId, userId);
		}
	}
}
