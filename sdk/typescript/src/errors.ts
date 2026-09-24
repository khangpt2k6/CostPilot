/**
 * Every failure the client throws is a CostPilotError. Governance outcomes get their own
 * classes so callers can branch on what the gateway decided, not on status codes:
 *
 * - 401 AuthenticationError: missing, unknown or revoked key
 * - 402 BudgetExceededError: a budget blocked the call before it reached the model (nothing billed)
 * - 403 PolicyDeniedError: a policy does not allow that model (or a team key hit an admin route)
 * - 202 ApprovalRequiredError: the call was parked for a human decision, not forwarded
 */
export class CostPilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class APIError extends CostPilotError {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
  /** OpenAI-style error.type from the gateway, when present */
  readonly type: string | undefined;

  constructor(status: number, message: string, body: unknown, headers: Headers) {
    super(message);
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.type = errorField(body, "type");
  }
}

export class AuthenticationError extends APIError {}

export class BudgetExceededError extends APIError {
  /** which budget blocked it, e.g. "team=research" */
  readonly scope: string | undefined;

  constructor(status: number, message: string, body: unknown, headers: Headers) {
    super(status, message, body, headers);
    this.scope = errorField(body, "code");
  }
}

export class PolicyDeniedError extends APIError {
  /** id of the policy rule that denied the call, when one matched */
  readonly ruleId: string | undefined;

  constructor(status: number, message: string, body: unknown, headers: Headers) {
    super(status, message, body, headers);
    const code = errorField(body, "code");
    this.ruleId = code && code !== "null" ? code : undefined;
  }
}

export class NotFoundError extends APIError {}

export class ConflictError extends APIError {}

export class RateLimitError extends APIError {}

export class InternalServerError extends APIError {}

export class ApprovalRequiredError extends CostPilotError {
  readonly approvalId: string;
  readonly model: string;
  readonly reason: string;
  readonly expiresAt: string;

  constructor(body: { id: string; model: string; reason: string; expires_at: string }) {
    super(`request held for approval (${body.id}): ${body.reason}`);
    this.approvalId = body.id;
    this.model = body.model;
    this.reason = body.reason;
    this.expiresAt = body.expires_at;
  }
}

export class APIConnectionError extends CostPilotError {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export class APITimeoutError extends APIConnectionError {}

export function errorFromResponse(status: number, body: unknown, headers: Headers): APIError {
  const message = errorField(body, "message") ?? (typeof body === "string" && body ? body : `HTTP ${status}`);
  if (status === 401) return new AuthenticationError(status, message, body, headers);
  if (status === 402) return new BudgetExceededError(status, message, body, headers);
  if (status === 403) return new PolicyDeniedError(status, message, body, headers);
  if (status === 404) return new NotFoundError(status, message, body, headers);
  if (status === 409) return new ConflictError(status, message, body, headers);
  if (status === 429) return new RateLimitError(status, message, body, headers);
  if (status >= 500) return new InternalServerError(status, message, body, headers);
  return new APIError(status, message, body, headers);
}

function errorField(body: unknown, field: "message" | "type" | "code"): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (err && typeof err === "object") {
    const v = (err as Record<string, unknown>)[field];
    return typeof v === "string" ? v : undefined;
  }
  if (field === "message" && typeof b.message === "string") return b.message;
  return undefined;
}
