package com.costpilot.account;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// 4.2: one external login (github / google / dev) pointing at an app_user.
@Entity
@Table(name = "user_identity")
public class UserIdentity {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(nullable = false, columnDefinition = "text")
	private String provider;

	// the provider's stable id for the person (GitHub numeric id, Google "sub")
	@Column(nullable = false, columnDefinition = "text")
	private String subject;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected UserIdentity() {
	}

	public UserIdentity(UUID userId, String provider, String subject) {
		this.userId = userId;
		this.provider = provider;
		this.subject = subject;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getProvider() {
		return provider;
	}

	public String getSubject() {
		return subject;
	}
}
