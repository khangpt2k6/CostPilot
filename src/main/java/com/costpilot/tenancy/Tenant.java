package com.costpilot.tenancy;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "tenant")
public class Tenant {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true, columnDefinition = "text")
	private String name;

	// 4.2: what people see; name stays the unique slug the ledger stores
	@Column(name = "display_name", columnDefinition = "text")
	private String displayName;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected Tenant() {
	}

	public Tenant(String name) {
		this.name = name;
	}

	public Tenant(String name, String displayName) {
		this.name = name;
		this.displayName = displayName;
	}

	public String getDisplayName() {
		return displayName != null ? displayName : name;
	}

	public void setDisplayName(String displayName) {
		this.displayName = displayName;
	}

	public UUID getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
