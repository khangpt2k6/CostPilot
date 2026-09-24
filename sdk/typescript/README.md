# @costpilot/sdk

TypeScript client for the [CostPilot](https://github.com/khangpt2k6/CostPilot) gateway.

CostPilot speaks the OpenAI API, so any OpenAI client works against it. This SDK adds what a plain client can't give you: the gateway's governance verdict as typed data, typed errors for budget/policy/approval outcomes, replay-safe retries, and the admin API.

Zero runtime dependencies. Node 18+, Deno, Bun, edge runtimes and browsers (anything with `fetch`).

```bash
npm install @costpilot/sdk
```

## Chat

```ts
import { CostPilot } from "@costpilot/sdk";

const cp = new CostPilot({
  apiKey: process.env.COSTPILOT_API_KEY, // default: COSTPILOT_API_KEY
  baseURL: "http://localhost:8080",      // default: COSTPILOT_BASE_URL, ".../v1" is accepted too
});

const res = await cp.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize this ticket" }],
  max_tokens: 256,
});

res.choices[0].message.content;
res.governance.modelDowngraded; // "gpt-4o -> gpt-4o-mini" when a policy or budget forced a cheaper model
res.governance.modelRouted;     // cost-based routing picked a cheaper model that meets the bar
res.governance.budgetWarning;   // set when a budget has under 20% left
res.governance.cacheHit;        // served from the semantic cache at $0
```

## Governance outcomes are exceptions you can branch on

```ts
import { ApprovalRequiredError, BudgetExceededError, PolicyDeniedError } from "@costpilot/sdk";

try {
  await cp.chat.completions.create({ model: "gpt-4o", messages });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    // 402: blocked before it reached the model, nothing was billed
    console.log("over budget:", err.scope);
  } else if (err instanceof PolicyDeniedError) {
    // 403: this team may not use that model
    console.log("denied by rule", err.ruleId);
  } else if (err instanceof ApprovalRequiredError) {
    // 202: parked for an admin; approve it in the console or via cp.approvals.approve(id)
    console.log("waiting for approval", err.approvalId, "until", err.expiresAt);
  } else throw err;
}
```

All errors extend `CostPilotError`. HTTP failures are `APIError` subclasses carrying `status`, `body` and `headers`; network failures are `APIConnectionError` / `APITimeoutError`.

## Streaming

```ts
const stream = await cp.chat.completions.stream({ model: "gpt-4o-mini", messages });

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}

stream.budgetCutoff; // true if the gateway cut the stream short to stay inside a budget
stream.usage;        // final token counts, when the upstream reported them
stream.abort();      // stop early; the gateway settles only what was generated
```

## Retries and timeouts

Connection errors, 408, 429 and 5xx are retried (default 2 retries, exponential backoff with jitter, `Retry-After` honored). Chat calls are safe to retry because every call sends an `Idempotency-Key` that is reused across the SDK's own retries, and the gateway's ledger charges a key once. Pass your own `idempotencyKey` if you retry at a higher level.

```ts
new CostPilot({ timeout: 30_000, maxRetries: 3 });
await cp.chat.completions.create(params, { timeout: 5_000, maxRetries: 0, signal: controller.signal });
```

Admin POSTs that are not idempotent (approve, reject, create key) are never retried.

## Attribution

A team key bills its own team. With an admin key you can attribute per call:

```ts
await cp.chat.completions.create(params, { team: "research", project: "search", user: "u_42", environment: "prod" });
// or once for the client
new CostPilot({ team: "research", environment: "staging" });
```

## Admin API

Needs an admin key (a team key gets `PolicyDeniedError`). Everything is scoped to the key's own workspace.

```ts
await cp.budgets.upsert({ scope: "team", ref: "research", limit: 500 }); // enforced on the next request
await cp.policies.upsert({
  scopeType: "team",
  scopeRef: "research",
  allowedModels: ["gpt-4o-mini", "claude-haiku-*"],
  fallbackAction: "downgrade",
  downgradeTo: "gpt-4o-mini",
  approvalThresholdUsd: 0.5,
});

for (const a of await cp.approvals.list()) await cp.approvals.approve(a.id);

const { key } = await cp.keys.create({ teamId, name: "ci" }); // secret shown once
await cp.keys.revoke(id);

const page = await cp.audit.list({ decision: "deny", from: new Date(Date.now() - 86_400_000) });
const byModel = await cp.analytics.spend({ groupBy: "model" });
const savings = await cp.analytics.savings();
```

## Development

```bash
npm install
npm test          # vitest, mocked fetch, no gateway needed
npm run typecheck
npm run build     # ESM + CJS + d.ts into dist/
```
