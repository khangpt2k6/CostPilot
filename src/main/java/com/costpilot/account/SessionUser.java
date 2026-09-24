package com.costpilot.account;

import java.util.UUID;

/**
 * 4.2: the logged-in person as stored in the HTTP session. Implemented by the OAuth2/OIDC
 * user objects and by the dev-login principal, so everything downstream sees one shape.
 */
public interface SessionUser {

	UUID userId();

	/** email when known, else the display name - what the activity log shows. */
	String label();
}
