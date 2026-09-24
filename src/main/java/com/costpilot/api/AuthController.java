package com.costpilot.api;

import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.costpilot.account.AccountService;
import com.costpilot.account.AppUser;
import com.costpilot.account.DevSessionUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 4.2: login bootstrap for the console. {@code /auth/providers} tells the login page which
 * buttons to show (and, being the first call, plants the XSRF-TOKEN cookie). OAuth2 itself
 * runs through Spring's /oauth2/authorization/{provider} + /login/oauth2/code/{provider}.
 *
 * <p>{@code /auth/dev-login} signs in by email with no password. It exists so localhost works
 * without registering OAuth apps, is 404 unless {@code costpilot.auth.dev-login.enabled},
 * and must never be enabled on a public deployment.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

	public record Providers(boolean github, boolean google, boolean devLogin) {
	}

	public record DevLoginRequest(@NotBlank @Email String email, String name) {
	}

	private final ObjectProvider<ClientRegistrationRepository> registrations;
	private final AccountService accounts;
	private final SecurityContextRepository contextRepository;
	private final MeController me;
	private final boolean devLoginEnabled;

	public AuthController(ObjectProvider<ClientRegistrationRepository> registrations, AccountService accounts,
			SecurityContextRepository contextRepository, MeController me,
			@Value("${costpilot.auth.dev-login.enabled:false}") boolean devLoginEnabled) {
		this.registrations = registrations;
		this.accounts = accounts;
		this.contextRepository = contextRepository;
		this.me = me;
		this.devLoginEnabled = devLoginEnabled;
	}

	@GetMapping("/providers")
	public Providers providers() {
		ClientRegistrationRepository repo = registrations.getIfAvailable();
		return new Providers(repo != null && repo.findByRegistrationId("github") != null,
				repo != null && repo.findByRegistrationId("google") != null, devLoginEnabled);
	}

	@PostMapping("/dev-login")
	public ResponseEntity<MeController.MeView> devLogin(@Valid @RequestBody DevLoginRequest body,
			HttpServletRequest request, HttpServletResponse response) {
		if (!devLoginEnabled) {
			return ResponseEntity.notFound().build();
		}
		String email = body.email().trim().toLowerCase(Locale.ROOT);
		AppUser user = accounts.loginOrRegister(
				new AccountService.ExternalProfile("dev", email, email, body.name(), null));

		// new session id on login (fixation), then persist the authenticated context in it
		if (request.getSession(false) != null) {
			request.changeSessionId();
		}
		var authentication = UsernamePasswordAuthenticationToken.authenticated(
				new DevSessionUser(user.getId(), user.label()), null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		contextRepository.saveContext(context, request, response);
		return ResponseEntity.ok(me.view(user.getId()));
	}
}
