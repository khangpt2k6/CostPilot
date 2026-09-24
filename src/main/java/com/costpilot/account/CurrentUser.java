package com.costpilot.account;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 4.2: the person behind a console request. A session request carries a {@link SessionUser}
 * either as the principal (no workspace resolved yet) or as the details of the workspace
 * authentication. An API-key request has no person, so this is empty.
 */
public final class CurrentUser {

	private CurrentUser() {
	}

	public static Optional<SessionUser> get() {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth == null) {
			return Optional.empty();
		}
		if (auth.getPrincipal() instanceof SessionUser user) {
			return Optional.of(user);
		}
		if (auth.getDetails() instanceof SessionUser user) {
			return Optional.of(user);
		}
		return Optional.empty();
	}

	public static SessionUser require() {
		return get().orElseThrow(() -> new NotAUserException());
	}

	/** Thrown when an endpoint that needs a person is called with an API key. */
	public static class NotAUserException extends RuntimeException {
		public NotAUserException() {
			super("this endpoint needs a logged-in user, not an api key");
		}
	}
}
