package com.costpilot.account;

import java.util.Collection;
import java.util.UUID;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;

// 4.2: a Google (OIDC) login, carrying our own user id into the session
public class AppOidcUser extends DefaultOidcUser implements SessionUser {

	private final UUID userId;
	private final String label;

	public AppOidcUser(UUID userId, String label, Collection<? extends GrantedAuthority> authorities,
			OidcIdToken idToken, OidcUserInfo userInfo) {
		super(authorities, idToken, userInfo);
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
