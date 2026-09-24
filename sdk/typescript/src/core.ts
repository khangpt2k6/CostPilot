import { APIConnectionError, APITimeoutError, CostPilotError, errorFromResponse } from "./errors.js";

export const VERSION = "0.1.0";

export interface ClientOptions {
  /** defaults to process.env.COSTPILOT_API_KEY */
  apiKey?: string;
  /** gateway root, e.g. https://costpilot.example.com. Defaults to COSTPILOT_BASE_URL or http://localhost:8080 */
  baseURL?: string;
  /** per attempt, in ms. Default 60s. For streams it bounds the wait for response headers. */
  timeout?: number;
  /** retries for connection errors, 408, 429 and 5xx. Default 2. */
  maxRetries?: number;
  /** default attribution for every call (admin keys only, except user/environment) */
  team?: string;
  project?: string;
  user?: string;
  environment?: string;
  defaultHeaders?: Record<string, string>;
  /** custom fetch (tests, proxies). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** safe to resend: GET/PUT/DELETE always, chat POSTs because they carry an Idempotency-Key */
  retryable?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  /** return the live Response (streaming) instead of reading the body */
  stream?: boolean;
}

export interface CallResult<T> {
  data: T;
  response: Response;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class HttpCore {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly options: ClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    const env = typeof process !== "undefined" ? process.env : {};
    const apiKey = options.apiKey ?? env.COSTPILOT_API_KEY;
    if (!apiKey) {
      throw new CostPilotError("missing api key: pass { apiKey } or set COSTPILOT_API_KEY");
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new CostPilotError("no fetch available: use Node 18+ or pass { fetch }");
    }
    this.apiKey = apiKey;
    // accept the OpenAI-style ".../v1" too; admin routes live at the root
    this.baseURL = (options.baseURL ?? env.COSTPILOT_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "").replace(/\/v1$/, "");
    this.timeout = options.timeout ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = fetchImpl;
    this.options = options;
  }

  async call<T>(method: string, path: string, opts: CallOptions = {}): Promise<CallResult<T>> {
    const url = this.url(path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: opts.stream ? "text/event-stream" : "application/json",
      "User-Agent": `costpilot-ts/${VERSION}`,
      ...this.options.defaultHeaders,
      ...opts.headers,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const maxRetries = opts.retryable === false ? 0 : (opts.maxRetries ?? this.maxRetries);
    const timeout = opts.timeout ?? this.timeout;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      let response: Response;
      let text = "";
      // a live stream keeps listening to the caller's signal so abort() still closes it
      let keepSignalLinked = false;
      try {
        response = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
        if (!opts.stream || !response.ok) text = await response.text();
        else keepSignalLinked = true;
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        const failure = timedOut
          ? new APITimeoutError(`request timed out after ${timeout}ms`, err)
          : new APIConnectionError(`could not reach ${this.baseURL}: ${(err as Error)?.message ?? err}`, err);
        if (attempt < maxRetries) {
          await sleep(backoff(attempt, null));
          continue;
        }
        throw failure;
      } finally {
        clearTimeout(timer);
        if (!keepSignalLinked) opts.signal?.removeEventListener("abort", onAbort);
      }

      if (response.ok) {
        if (opts.stream) return { data: undefined as T, response };
        return { data: (text ? parse(text) : undefined) as T, response };
      }
      if (RETRY_STATUS.has(response.status) && attempt < maxRetries) {
        await sleep(backoff(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw errorFromResponse(response.status, text ? parse(text) : undefined, response.headers);
    }
  }

  private url(path: string, query?: CallOptions["query"]): string {
    const u = new URL(this.baseURL + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    }
    return u.toString();
  }
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** exponential with jitter, honoring Retry-After (seconds) up to a minute */
export function backoff(attempt: number, retryAfter: string | null): number {
  const hinted = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(hinted) && hinted >= 0) return Math.min(hinted, 60) * 1000;
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base * (0.75 + Math.random() * 0.25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isoTime(t: Date | string | undefined): string | undefined {
  if (t === undefined) return undefined;
  return typeof t === "string" ? t : t.toISOString();
}
