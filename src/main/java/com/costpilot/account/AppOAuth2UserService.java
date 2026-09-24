package com.costpilot.account;

import java.util.Map;

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

/**
 * 4.2: turns a provider login into a CostPilot account. Spring fetches the profile; we map
 * it to {@link AccountService.ExternalProfile}, find-or-create the user, and put our own
 * user id into the session principal.
 */
@Component
public class AppOAuth2UserService {

	private final AccountService accounts;
	private final DefaultOAuth2UserService oauth2 = new DefaultOAuth2UserService();
	private final OidcUserService oidc = new OidcUserService();

	public AppOAuth2UserService(AccountService accounts) {
		this.accounts = accounts;
	}

	/** GitHub and other plain OAuth2 providers. */
	public OAuth2UserService<OAuth2UserRequest, OAuth2User> oauth2() {
		return request -> {
			OAuth2User raw = oauth2.loadUser(request);
			String provider = request.getClientRegistration().getRegistrationId();
			AppUser user = accounts.loginOrRegister(profileFromAttributes(provider, raw.getAttributes()));
			String nameKey = request.getClientRegistration().getProviderDetails().getUserInfoEndpoint()
					.getUserNameAttributeName();
			return new AppOAuth2User(user.getId(), user.label(), raw.getAuthorities(), raw.getAttributes(), nameKey);
		};
	}

	/** Google and other OIDC providers. */
	public OAuth2UserService<OidcUserRequest, OidcUser> oidc() {
		return request -> {
			OidcUser raw = oidc.loadUser(request);
			String provider = request.getClientRegistration().getRegistrationId();
			AppUser user = accounts.loginOrRegister(new AccountService.ExternalProfile(provider, raw.getSubject(),
					raw.getEmail(), raw.getFullName(), raw.getPicture()));
			return new AppOidcUser(user.getId(), user.label(), raw.getAuthorities(), raw.getIdToken(),
					raw.getUserInfo());
		};
	}

	// GitHub: numeric "id" is stable ("login" can be renamed), "name" is often unset
	static AccountService.ExternalProfile profileFromAttributes(String provider, Map<String, Object> a) {
		String subject = String.valueOf(a.getOrDefault("id", a.get("sub")));
		String name = str(a.get("name"));
		if (name == null) {
			name = str(a.get("login"));
		}
		String avatar = str(a.getOrDefault("avatar_url", a.get("picture")));
		return new AccountService.ExternalProfile(provider, subject, str(a.get("email")), name, avatar);
	}

	private static String str(Object o) {
		return o == null || o.toString().isBlank() ? null : o.toString();
	}
}
