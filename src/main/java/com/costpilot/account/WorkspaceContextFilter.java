package com.costpilot.account;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.costpilot.security.AuthenticatedPrincipal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 4.2: turns a logged-in person into the same {@link AuthenticatedPrincipal} an API key
 * produces, for the workspace this request is about.
 *
 * <p>The workspace comes from {@code X-Workspace-ID} (a tenant id), else the person's first
 * workspace. Asking for a workspace you don't belong to is a 403. The resolved principal is
 * installed for this request only and never written back to the session, so switching
 * workspaces is just a different header on the next call.
 *
 * <p>Owner/admin get ROLE_ADMIN, member gets ROLE_MEMBER. A session principal has no team, so
 * it reads workspace-wide (see {@link AuthenticatedPrincipal#teamScope()}).
 */
public class WorkspaceContextFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Workspace-ID";

	private final AccountService accounts;

	public WorkspaceContextFilter(AccountService accounts) {
		this.accounts = accounts;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof SessionUser user) {
			UUID requested;
			try {
				requested = parse(request.getHeader(HEADER));
			} catch (IllegalArgumentException e) {
				response.sendError(HttpStatus.BAD_REQUEST.value(), "invalid " + HEADER);
				return;
			}
			Optional<AccountService.Membership> membership = requested != null
					? accounts.membership(user.userId(), requested)
					: accounts.memberships(user.userId()).stream().findFirst();
			if (requested != null && membership.isEmpty()) {
				response.sendError(HttpStatus.FORBIDDEN.value(), "not a member of that workspace");
				return;
			}
			membership.ifPresent(m -> install(user, m));
		}
		chain.doFilter(request, response);
	}

	private static void install(SessionUser user, AccountService.Membership m) {
		AuthenticatedPrincipal principal = new AuthenticatedPrincipal(m.slug(), null, null, null,
				m.role().canAdminister(), m.tenantId(), "user:" + user.label());
		List<GrantedAuthority> authorities = new ArrayList<>();
		authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
		authorities.add(new SimpleGrantedAuthority(m.role().canAdminister() ? "ROLE_ADMIN" : "ROLE_MEMBER"));
		if (m.role() == WorkspaceRole.OWNER) {
			authorities.add(new SimpleGrantedAuthority("ROLE_OWNER"));
		}
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(new WorkspaceAuthentication(principal, user, m.role(), authorities));
		SecurityContextHolder.setContext(context);
	}

	private static UUID parse(String header) {
		return header == null || header.isBlank() ? null : UUID.fromString(header.trim());
	}

	/** Request-scoped authentication: principal = workspace view, details = the person. */
	public static final class WorkspaceAuthentication extends AbstractAuthenticationToken {

		private final AuthenticatedPrincipal principal;
		private final WorkspaceRole role;

		WorkspaceAuthentication(AuthenticatedPrincipal principal, SessionUser user, WorkspaceRole role,
				List<GrantedAuthority> authorities) {
			super(authorities);
			this.principal = principal;
			this.role = role;
			setDetails(user);
			setAuthenticated(true);
		}

		public WorkspaceRole role() {
			return role;
		}

		@Override
		public Object getCredentials() {
			return null;
		}

		@Override
		public Object getPrincipal() {
			return principal;
		}
	}
}
