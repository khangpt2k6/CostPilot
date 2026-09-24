package com.costpilot.account;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// 4.2: a single-use invite link into a workspace. Only the token's hash is stored.
@Entity
@Table(name = "workspace_invite")
public class WorkspaceInvite {

	public enum Status {
		PENDING, ACCEPTED, REVOKED, EXPIRED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "tenant_id", nullable = false)
	private UUID tenantId;

	@Column(name = "token_hash", nullable = false, unique = true, columnDefinition = "text")
	private String tokenHash;

	@Column(nullable = false, columnDefinition = "text")
	private String role;

	@Column(name = "created_by")
	private UUID createdBy;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "accepted_by")
	private UUID acceptedBy;

	@Column(name = "accepted_at")
	private Instant acceptedAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	protected WorkspaceInvite() {
	}

	public WorkspaceInvite(UUID tenantId, String tokenHash, WorkspaceRole role, UUID createdBy, Instant expiresAt) {
		if (role == WorkspaceRole.OWNER) {
			throw new IllegalArgumentException("ownership is granted by an owner, not by invite");
		}
		this.tenantId = tenantId;
		this.tokenHash = tokenHash;
		this.role = role.dbValue();
		this.createdBy = createdBy;
		this.expiresAt = expiresAt;
	}

	public Status status(Instant now) {
		if (revokedAt != null) {
			return Status.REVOKED;
		}
		if (acceptedAt != null) {
			return Status.ACCEPTED;
		}
		return now.isBefore(expiresAt) ? Status.PENDING : Status.EXPIRED;
	}

	public void accept(UUID userId, Instant when) {
		this.acceptedBy = userId;
		this.acceptedAt = when;
	}

	public void revoke(Instant when) {
		this.revokedAt = when;
	}

	public UUID getId() {
		return id;
	}

	public UUID getTenantId() {
		return tenantId;
	}

	public WorkspaceRole getRole() {
		return WorkspaceRole.fromDbValue(role);
	}

	public UUID getCreatedBy() {
		return createdBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

	public UUID getAcceptedBy() {
		return acceptedBy;
	}

	public Instant getAcceptedAt() {
		return acceptedAt;
	}
}
