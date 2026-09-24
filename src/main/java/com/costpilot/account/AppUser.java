package com.costpilot.account;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// 4.2: a person who logs into the console. Email is optional - GitHub hides it by default.
@Entity
@Table(name = "app_user")
public class AppUser {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(columnDefinition = "text")
	private String email;

	@Column(name = "display_name", nullable = false, columnDefinition = "text")
	private String displayName;

	@Column(name = "avatar_url", columnDefinition = "text")
	private String avatarUrl;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "last_login_at")
	private Instant lastLoginAt;

	protected AppUser() {
	}

	public AppUser(String email, String displayName, String avatarUrl) {
		this.email = email;
		this.displayName = displayName;
		this.avatarUrl = avatarUrl;
		this.lastLoginAt = Instant.now();
	}

	/** Refresh the profile from the provider on every login; blanks never erase what we have. */
	public void touchLogin(String email, String displayName, String avatarUrl) {
		if (email != null && !email.isBlank()) {
			this.email = email;
		}
		if (displayName != null && !displayName.isBlank()) {
			this.displayName = displayName;
		}
		if (avatarUrl != null && !avatarUrl.isBlank()) {
			this.avatarUrl = avatarUrl;
		}
		this.lastLoginAt = Instant.now();
	}

	/** How this person shows up in the admin activity log. */
	public String label() {
		return email != null ? email : displayName;
	}

	public UUID getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getDisplayName() {
		return displayName;
	}

	public String getAvatarUrl() {
		return avatarUrl;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getLastLoginAt() {
		return lastLoginAt;
	}
}
