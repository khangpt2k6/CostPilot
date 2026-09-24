import { describe, expect, it, vi } from "vitest";

import {
  APIConnectionError,
  APITimeoutError,
  ApprovalRequiredError,
  AuthenticationError,
  BudgetExceededError,
  CostPilot,
  CostPilotError,
  PolicyDeniedError,
} from "../src/index.js";

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function client(handler: Handler, extra: Partial<ConstructorParameters<typeof CostPilot>[0]> = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  });
  const cp = new CostPilot({ apiKey: "cp_test", baseURL: "http://gw.test/v1", fetch: fetchMock as typeof fetch, maxRetries: 2, ...extra });
  return { cp, calls, fetchMock };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const completion = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1,
  model: "gpt-4o-mini",
  choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
};

const msg = { model: "gpt-4o", messages: [{ role: "user" as const, content: "hello" }] };

describe("construction", () => {
  it("needs an api key", () => {
    const saved = process.env.COSTPILOT_API_KEY;
    delete process.env.COSTPILOT_API_KEY;
    expect(() => new CostPilot({ fetch: vi.fn() as never })).toThrow(CostPilotError);
    process.env.COSTPILOT_API_KEY = saved;
  });

  it("accepts an OpenAI-style base URL ending in /v1", () => {
    const { cp } = client(() => json(200, completion));
    expect(cp.baseURL).toBe("http://gw.test");
  });
});

describe("chat.completions.create", () => {
  it("sends auth, attribution and an idempotency key, and reads governance headers", async () => {
    const { cp, calls } = client(() =>
      json(200, completion, {
        "X-CostPilot-Model-Downgraded": "gpt-4o -> gpt-4o-mini",
        "X-CostPilot-Budget-Warning": "team=research budget below 20% remaining",
      }),
    );
    const res = await cp.chat.completions.create(msg, { team: "research", user: "u1", environment: "prod" });

    expect(res.choices[0]?.message.content).toBe("hi");
    expect(res.governance.modelDowngraded).toBe("gpt-4o -> gpt-4o-mini");
    expect(res.governance.budgetWarning).toContain("research");
    expect(res.governance.cacheHit).toBe(false);

    const { url, init } = calls[0]!;
    const h = init.headers as Record<string, string>;
    expect(url.pathname).toBe("/v1/chat/completions");
    expect(h.Authorization).toBe("Bearer cp_test");
    expect(h["X-Team-ID"]).toBe("research");
    expect(h["X-User-ID"]).toBe("u1");
    expect(h["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "gpt-4o", stream: false });
  });

  it("maps a 402 to BudgetExceededError with the blocking scope", async () => {
    const { cp } = client(() =>
      json(402, { error: { message: "budget exceeded for team=research", type: "budget_exceeded", code: "team" } }),
    );
    const err = await cp.chat.completions.create(msg).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err.status).toBe(402);
    expect(err.scope).toBe("team");
    expect(err.message).toContain("budget exceeded");
  });

  it("maps a 403 to PolicyDeniedError with the rule id", async () => {
    const { cp } = client(() => json(403, { error: { message: "model not allowed", type: "policy_denied", code: "r-1" } }));
    const err = await cp.chat.completions.create(msg).catch((e) => e);
    expect(err).toBeInstanceOf(PolicyDeniedError);
    expect(err.ruleId).toBe("r-1");
  });

  it("maps a 401 to AuthenticationError without retrying", async () => {
    const { cp, fetchMock } = client(() => new Response("", { status: 401 }));
    await expect(cp.chat.completions.create(msg)).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns a 202 into ApprovalRequiredError", async () => {
    const { cp } = client(() =>
      json(202, { id: "ap-1", object: "approval.pending", state: "pending", model: "gpt-4o", reason: "over threshold", expires_at: "2026-01-01T00:00:00Z" }),
    );
    const err = await cp.chat.completions.create(msg).catch((e) => e);
    expect(err).toBeInstanceOf(ApprovalRequiredError);
    expect(err.approvalId).toBe("ap-1");
    expect(err.expiresAt).toBe("2026-01-01T00:00:00Z");
  });

  it("retries 5xx with the SAME idempotency key so the ledger charges once", async () => {
    let n = 0;
    const { cp, calls } = client(() => (++n < 3 ? json(503, { error: { message: "busy" } }, { "retry-after": "0" }) : json(200, completion)));
    const res = await cp.chat.completions.create(msg);
    expect(res.id).toBe("chatcmpl-1");
    expect(calls).toHaveLength(3);
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("gives up after maxRetries and surfaces connection errors", async () => {
    const { cp, fetchMock } = client(() => {
      throw new TypeError("fetch failed");
    }, { maxRetries: 1 });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const err = await cp.chat.completions.create(msg).catch((e) => e);
    vi.useRealTimers();
    expect(err).toBeInstanceOf(APIConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request", async () => {
    const { cp } = client(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      { maxRetries: 0, timeout: 20 },
    );
    await expect(cp.chat.completions.create(msg)).rejects.toBeInstanceOf(APITimeoutError);
  });
});

function sse(events: string[], headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // split mid-event on purpose: parsers must buffer across reads
      const raw = events.map((e) => `data: ${e}\n\n`).join("");
      const mid = Math.floor(raw.length / 2);
      controller.enqueue(encoder.encode(raw.slice(0, mid)));
      controller.enqueue(encoder.encode(raw.slice(mid)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

const chunk = (content: string | null, finish: string | null = null) =>
  JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { content }, finish_reason: finish }] });

describe("chat.completions.stream", () => {
  it("yields chunks, joins content and reports usage", async () => {
    const usage = JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } });
    const { cp, calls } = client(() => sse([chunk("Hel"), chunk("lo", "stop"), usage, "[DONE]"], { "X-CostPilot-Cache": "hit" }));
    const stream = await cp.chat.completions.stream(msg);
    const seen: string[] = [];
    for await (const c of stream) seen.push(c.choices[0]?.delta.content ?? "");
    expect(seen.join("")).toBe("Hello");
    expect(stream.content).toBe("Hello");
    expect(stream.usage?.total_tokens).toBe(4);
    expect(stream.budgetCutoff).toBe(false);
    expect(stream.governance.cacheHit).toBe(true);
    expect(JSON.parse(calls[0]!.init.body as string).stream).toBe(true);
  });

  it("flags a mid-stream budget cutoff", async () => {
    const { cp } = client(() => sse([chunk("partial"), chunk(null, "budget_cutoff"), "[DONE]"]));
    const stream = await cp.chat.completions.stream(msg);
    expect(await stream.finalContent()).toBe("partial");
    expect(stream.budgetCutoff).toBe(true);
  });

  it("raises governance errors before any chunk", async () => {
    const { cp } = client(() => json(402, { error: { message: "no budget", type: "budget_exceeded", code: "team" } }));
    await expect(cp.chat.completions.stream(msg)).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

describe("admin", () => {
  it("upserts a budget with PUT and lists them", async () => {
    const { cp, calls } = client((url, init) =>
      init.method === "PUT" ? json(200, { scope: "team", ref: "research", limit: 50, remaining: 50, active: true }) : json(200, []),
    );
    const b = await cp.budgets.upsert({ scope: "team", ref: "research", limit: 50 });
    expect(b.remaining).toBe(50);
    expect(calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ scope: "team", ref: "research", limit: 50 });
    await cp.budgets.remove("team", "research");
    expect(calls[1]!.url.search).toBe("?scope=team&ref=research");
  });

  it("converts a USD approval threshold into nanodollars", async () => {
    const { cp, calls } = client(() => json(200, {}));
    await cp.policies.upsert({ scopeType: "team", scopeRef: "research", allowedModels: ["gpt-4o-mini", "claude-*"], fallbackAction: "require_approval", approvalThresholdUsd: 0.25 });
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ allowedModels: "gpt-4o-mini,claude-*", approvalThresholdNanos: 250_000_000 });
  });

  it("never retries a non-idempotent admin POST", async () => {
    const { cp, fetchMock } = client(() => json(503, {}));
    await expect(cp.approvals.approve("ap-1")).rejects.toBeInstanceOf(CostPilotError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes analytics windows as ISO strings", async () => {
    const { cp, calls } = client(() => json(200, []));
    await cp.analytics.spend({ groupBy: "model", from: new Date("2026-09-01T00:00:00Z") });
    expect(calls[0]!.url.pathname).toBe("/api/analytics/spend");
    expect(calls[0]!.url.searchParams.get("groupBy")).toBe("model");
    expect(calls[0]!.url.searchParams.get("from")).toBe("2026-09-01T00:00:00.000Z");
  });
});
