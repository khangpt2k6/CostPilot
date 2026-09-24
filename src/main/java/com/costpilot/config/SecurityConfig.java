package com.costpilot.config;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.util.matcher.RequestMatcher;

import com.costpilot.account.AccountService;
import com.costpilot.account.AppOAuth2UserService;
import com.costpilot.account.WorkspaceContextFilter;
import com.costpilot.security.ApiKeyAuthFilter;
import com.costpilot.security.ApiKeyAuthService;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Two filter chains over the same controllers.
 *
 * <p><b>API chain</b> (6.1, order 1): stateless API-key auth for anything that presents a key
 * ({@code Authorization: Bearer} / {@code X-API-Key}) and for the machine-only paths
 * ({@code /v1}, {@code /mock}, {@code /actuator}). No session, no CSRF - SDK, CLI and gateway
 * traffic behave exactly as before 4.2.
 *
 * <p><b>Console chain</b> (4.2, order 2): everything else, i.e. the dashboard. Login via
 * GitHub/Google OAuth2 (when configured) or dev-login, an httpOnly session cookie, and CSRF
 * via a readable XSRF-TOKEN cookie echoed back as X-XSRF-TOKEN. {@link WorkspaceContextFilter}
 * maps the person + X-Workspace-ID onto the same principal an API key produces, so the
 * admin/analytics controllers serve both chains unchanged.
 */
@Configuration
public class SecurityConfig {

	// a key on the request always wins, so a key-carrying call never needs a CSRF token
	static final RequestMatcher API_REQUESTS = request -> hasApiKey(request)
			|| startsWith(request, "/v1/") || startsWith(request, "/mock/") || startsWith(request, "/actuator/");

	// governance writes stay admin-only on both chains
	private static final String[] ADMIN_SURFACES = { "/admin/keys/**", "/admin/budgets/**", "/admin/policies/**",
			"/admin/approvals/**", "/admin/activity/**" };

	@Bean
	@Order(1)
	SecurityFilterChain apiChain(HttpSecurity http, ApiKeyAuthService authService) throws Exception {
		http
				.securityMatcher(API_REQUESTS)
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// only authorize the initial REQUEST dispatch, not ASYNC/ERROR/FORWARD.
						// the gateway streams via SseEmitter (MVC async); re-authorizing the
						// ASYNC dispatch under the stateless (empty) context would deny the
						// already-authorized request and sever the stream mid-flight
						// ("Connection prematurely closed DURING response").
						.shouldFilterAllDispatcherTypes(false)
						.requestMatchers("/actuator/health", "/actuator/health/**",
								"/actuator/prometheus",
								// 3.1: version + commit of the running artifact. Carries no
								// secrets (info.env and info.java are off in application.yml)
								// and is how a deploy gets verified without a key.
								"/actuator/info", "/mock/**")
						.permitAll()
						// admin-only control plane: key minting (6.1) + governance config and
						// approvals (9.x) require a tenant-admin key. /admin/audit stays out of
						// this list on purpose - it is team-scoped read for non-admins too.
						.requestMatchers(ADMIN_SURFACES)
						.hasRole("ADMIN")
						.anyRequest().authenticated())
				.exceptionHandling(e -> e
						// unauthenticated -> 401; authenticated-but-forbidden (e.g. a team
						// key hitting /admin/keys) -> 403. Set both explicitly so the
						// distinction is deterministic across Spring Security versions.
						.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
						.accessDeniedHandler((request, response, ex) ->
								response.sendError(HttpStatus.FORBIDDEN.value())))
				.addFilterBefore(new ApiKeyAuthFilter(authService), UsernamePasswordAuthenticationFilter.class);
		return http.build();
	}

	@Bean
	@Order(2)
	SecurityFilterChain consoleChain(HttpSecurity http, AccountService accounts, AppOAuth2UserService users,
			ObjectProvider<ClientRegistrationRepository> registrations,
			SecurityContextRepository securityContextRepository,
			@Value("${costpilot.web.base-url:}") String webBaseUrl) throws Exception {
		http
				.csrf(csrf -> csrf
						.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
						.csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
				.securityContext(c -> c.securityContextRepository(securityContextRepository))
				.authorizeHttpRequests(auth -> auth
						.shouldFilterAllDispatcherTypes(false)
						// the legacy static dashboard shell + login bootstrap
						.requestMatchers("/", "/index.html", "/dashboard/**", "/error",
								"/auth/providers", "/auth/dev-login")
						.permitAll()
						// invite preview so the join page can show where the link leads
						.requestMatchers(HttpMethod.GET, "/api/invites/*").permitAll()
						// gateway traffic must present a key (API chain); never via a cookie
						.requestMatchers("/v1/**").denyAll()
						// members read the whole workspace
						.requestMatchers(HttpMethod.GET, "/admin/**", "/api/analytics/**", "/api/workspace/**")
						.hasAnyRole("ADMIN", "MEMBER")
						// leaving a workspace is a DELETE on yourself; the service enforces that
						// a member can only remove themselves
						.requestMatchers(HttpMethod.DELETE, "/api/workspace/members/**")
						.hasAnyRole("ADMIN", "MEMBER")
						.requestMatchers("/admin/**", "/api/workspace/**").hasRole("ADMIN")
						.anyRequest().authenticated())
				.exceptionHandling(e -> e
						// an SPA wants a status, not a redirect to a login page
						.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
						.accessDeniedHandler((request, response, ex) ->
								response.sendError(HttpStatus.FORBIDDEN.value())))
				.logout(logout -> logout
						.logoutUrl("/auth/logout")
						.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
				.addFilterBefore(new WorkspaceContextFilter(accounts), AuthorizationFilter.class);

		// OAuth2 login is only wired when a provider is configured (client id/secret via env);
		// localhost without OAuth apps uses dev-login instead
		if (registrations.getIfAvailable() != null) {
			String home = webBaseUrl == null ? "" : webBaseUrl.replaceAll("/$", "");
			http.oauth2Login(oauth -> oauth
					// our own SPA owns /login; this also stops Spring generating a login page
					.loginPage("/login")
					.userInfoEndpoint(u -> u.userService(users.oauth2()).oidcUserService(users.oidc()))
					.successHandler((request, response, authentication) -> response.sendRedirect(home + "/"))
					.failureHandler((request, response, ex) -> response.sendRedirect(home + "/login?error")));
		}
		return http.build();
	}

	// shared so dev-login saves the session exactly the way the console chain reads it
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	private static boolean hasApiKey(HttpServletRequest request) {
		String authorization = request.getHeader("Authorization");
		if (authorization != null && authorization.startsWith("Bearer ")) {
			return true;
		}
		String apiKey = request.getHeader("X-API-Key");
		return apiKey != null && !apiKey.isBlank();
	}

	private static boolean startsWith(HttpServletRequest request, String prefix) {
		String path = request.getRequestURI().substring(request.getContextPath().length());
		return path.startsWith(prefix);
	}
}
