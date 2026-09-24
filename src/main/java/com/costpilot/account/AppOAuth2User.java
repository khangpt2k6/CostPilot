package com.costpilot.account;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

// 4.2: a GitHub (plain OAuth2) login, carrying our own user id into the session
public class AppOAuth2User extends DefaultOAuth2User implements SessionUser {

	private final UUID userId;
	private final String label;

	public AppOAuth2User(UUID userId, String label, Collection<? extends GrantedAuthority> authorities,
			Map<String, Object> attributes, String nameAttributeKey) {
		super(authorities, attributes, nameAttributeKey);
		this.userId = userId;
		this.label = label;
	}

	@Override
	public UUID userId() {
		return userId;
	}

	@Override
	public String label() {
		return label;
	}

	@Override
	public String getName() {
		return userId.toString();
	}
}
