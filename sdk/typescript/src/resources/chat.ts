import type { HttpCore } from "../core.js";
import { ApprovalRequiredError } from "../errors.js";
import { ChatStream } from "../streaming.js";
import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionResponse,
  Governance,
  RequestOptions,
} from "../types.js";

export class Chat {
  readonly completions: Completions;

  constructor(core: HttpCore) {
    this.completions = new Completions(core);
  }
}

export class Completions {
  constructor(private readonly core: HttpCore) {}

  /**
   * One governed chat completion. Resolves with the OpenAI-shaped body plus
   * {@link Governance}; rejects with BudgetExceededError, PolicyDeniedError or
   * ApprovalRequiredError when the gateway says no or not yet.
   *
   * Retries are replay-safe: every call carries an Idempotency-Key (yours, or a fresh one
   * reused across the SDK's own retries), so the gateway's ledger charges it once.
   */
  async create(params: ChatCompletionCreateParams, options: RequestOptions = {}): Promise<ChatCompletionResponse> {
    const { data, response } = await this.core.call<ChatCompletion | Record<string, unknown>>("POST", "/v1/chat/completions", {
      body: { ...params, stream: false },
      headers: this.headers(options),
      retryable: true,
      signal: options.signal,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
    });
    if (response.status === 202) throw new ApprovalRequiredError(data as never);
    return Object.assign(data as ChatCompletion, { governance: governanceOf(response.headers) });
  }

  /**
   * Streamed completion. Await it for the stream (headers are in, governance known), then
   * `for await` the chunks. Check `stream.budgetCutoff` afterwards.
   */
  async stream(params: ChatCompletionCreateParams, options: RequestOptions = {}): Promise<ChatStream> {
    const controller = new AbortController();
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const { response } = await this.core.call<unknown>("POST", "/v1/chat/completions", {
      body: { ...params, stream: true },
      headers: this.headers(options),
      retryable: true,
      signal: controller.signal,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
      stream: true,
    });
    if (response.status === 202) {
      throw new ApprovalRequiredError((await response.json()) as never);
    }
    return new ChatStream(response, governanceOf(response.headers), controller);
  }

  private headers(options: RequestOptions): Record<string, string> {
    const defaults = this.core.options;
    const h: Record<string, string> = {
      "Idempotency-Key": options.idempotencyKey ?? randomId(),
      ...options.headers,
    };
    const team = options.team ?? defaults.team;
    const project = options.project ?? defaults.project;
    const user = options.user ?? defaults.user;
    const environment = options.environment ?? defaults.environment;
    if (team) h["X-Team-ID"] = team;
    if (project) h["X-Project-ID"] = project;
    if (user) h["X-User-ID"] = user;
    if (environment) h["X-Environment"] = environment;
    if (options.minTier !== undefined) h["X-CostPilot-Min-Tier"] = String(options.minTier);
    return h;
  }
}

export function governanceOf(headers: Headers): Governance {
  const cp: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-costpilot")) cp[key.toLowerCase()] = value;
  });
  return {
    cacheHit: cp["x-costpilot-cache"] === "hit",
    budgetWarning: cp["x-costpilot-budget-warning"] ?? null,
    modelRouted: cp["x-costpilot-model-routed"] ?? null,
    modelDowngraded: cp["x-costpilot-model-downgraded"] ?? null,
    headers: cp,
  };
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
