package com.costpilot.config;

import java.util.function.Supplier;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 4.2: CSRF for a single-page app (the pattern from the Spring Security reference).
 *
 * <p>The dashboard reads the raw token from the XSRF-TOKEN cookie and sends it back in the
 * X-XSRF-TOKEN header, so a header value is compared as-is. Anything else (a server-rendered
 * form) still gets BREACH-safe XOR masking. Loading the token on every request makes sure the
 * cookie exists before the first write.
 */
final class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

	private final CsrfTokenRequestHandler plain = new CsrfTokenRequestAttributeHandler();
	private final CsrfTokenRequestHandler xor = new XorCsrfTokenRequestAttributeHandler();

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
		xor.handle(request, response, csrfToken);
		// render the token now so the cookie is written on the very first response
		csrfToken.get();
	}

	@Override
	public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
		String header = request.getHeader(csrfToken.getHeaderName());
		return (StringUtils.hasText(header) ? plain : xor).resolveCsrfTokenValue(request, csrfToken);
	}
}
