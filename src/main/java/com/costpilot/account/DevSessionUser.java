package com.costpilot.account;

import java.io.Serializable;
import java.util.UUID;

// 4.2: principal for /auth/dev-login (localhost only, off unless explicitly enabled)
public record DevSessionUser(UUID userId, String label) implements SessionUser, Serializable {
}
