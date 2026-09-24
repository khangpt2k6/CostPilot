<div align="center">

# CostPilot documentation

Everything you need to run it, drive it, and point it at a real provider.

[← Back to the project](../README.md) · [Benchmarks](BENCHMARK.md)

</div>

---

## Contents

| | page | what is in it |
|---|---|---|
| 1 | [Run it](#1-run-it) | one command, what comes up, seeded keys |
| 2 | [The console](#2-the-console) | sign in, workspaces, roles, invites, GitHub/Google login |
| 3 | [The ten minute demo](#3-the-ten-minute-demo) | normal request, mid stream cutoff, hard block, dashboard, analytics |
| 4 | [Admin CLI](#4-admin-cli) | budgets, policy, approvals, spend |
| 5 | [TypeScript SDK](#5-typescript-sdk) | typed governance outcomes, streaming, admin API |
| 6 | [Python SDK](#6-python-sdk) | governance aware client |
| 7 | [Semantic cache](#7-semantic-cache) | optional, serves close prompts for free |
| 8 | [Going live](#8-going-live-with-real-providers) | OpenAI, Anthropic, Gemini on Vertex |
| 9 | [Response headers and errors](#9-response-headers-and-errors) | what the gateway tells your client |
| 10 | [Load test](#10-load-test) | reproducing the numbers |
| 11 | [Development](#11-development) | build, test, coverage gate |
| 12 | [Releases](#12-releases) | tagging, published image, SBOM, provenance |

---

## 1. Run it

The only prerequisite is Docker. The default upstream is a mock provider embedded in the app, so nothing below touches a real provider or costs a cent.

```bash
git clone https://github.com/khangpt2k6/CostPilot.git
cd CostPilot
docker compose up --build -d

# first boot takes 2 to 3 minutes: image build plus the whole stack
docker compose ps gateway
```

What comes up:

| service | port | role |
|---|---|---|
| gateway | 8080 | the governance control plane and the OpenAI compatible API |
| console | 3000 | the web app: sign in, workspaces, budgets, policies, approvals, keys, analytics |
| Postgres + pgvector | 5432 | source of truth: ledger, budgets, policy, audit, prices |
| Redis | 6379 | live remaining budget counters |
| Kafka | 9092 | usage events, published after a request settles |
| ClickHouse | 8123 | spend analytics, fed from Kafka |
| Prometheus | 9090 | governance metrics |
| Grafana | 3300 | auto provisioned ops dashboard, anonymous viewer |

Seeded demo keys. These are dev only, the database stores hashes, and the raw values are public here on purpose.

| key | scope |
|---|---|
| `cp_demo_team_platform` | team `platform` |
| `cp_demo_team_research` | team `research` |
| `cp_admin_root` | tenant admin, may act for any team via `X-Team-ID` |

For any real deployment, override `COSTPILOT_API_KEY_PEPPER` and mint fresh keys with `POST /admin/keys`.

---

## 2. The console

Open <http://localhost:3000>. The compose stack turns on **dev login**: type any email, no password. It exists so the stack works on a laptop without registering OAuth apps, and it is off unless `COSTPILOT_AUTH_DEV_LOGIN_ENABLED=true`. Never enable it on a public host.

Your first sign-in creates you, a workspace you own, and a `default` team and project, so you can mint a key straight away. Locally you also join the seeded `acme` workspace as an admin (`COSTPILOT_AUTH_DEMO_TENANT=acme`), which is where the demo keys and traffic live. Switch workspaces from the sidebar.

| page | what it does |
|---|---|
| Overview | spend, requests, savings, blocked/held counts, daily spend, spend by team and model, decision mix, budget utilization |
| Quickstart / Playground | copyable snippets; send a real request with a key and see what governance did to it |
| Budgets / Policies | caps per workspace, team, project or model; allowed models, downgrade targets, approval thresholds |
| Approvals | held requests; approving replays the original call and bills it, rejecting never calls the model |
| API keys | mint (secret shown once), see team and project, revoke (401 on the next call) |
| Teams / Members | teams and projects; roles and single-use invite links |
| Request log / Activity | why each request got its decision; who changed which setting |

<p align="center">
  <img src="console-budgets.png" alt="Budgets page listing a model cap and two team caps, one near its limit" width="100%">
</p>

**Roles.** Owner and admin manage budgets, policies, approvals, keys and people. Member sees the whole workspace and changes nothing. A workspace always keeps at least one owner, only an owner can grant or remove ownership, and anyone can leave. Invite links are single use, expire after 7 days, and never grant ownership.

**Isolation.** A workspace is a tenant. Budgets, policies, approvals, the audit trail, analytics and keys are all confined to it, including when two workspaces use the same team names. `TenantIsolationIT` proves it for every surface.

**How the console authenticates.** The gateway runs two security chains over the same controllers. Anything carrying an API key (and all of `/v1`) goes through the stateless key chain exactly as before. The console uses an httpOnly session cookie plus a CSRF token (the readable `XSRF-TOKEN` cookie echoed back as `X-XSRF-TOKEN`), and names the active workspace in `X-Workspace-ID`. The Next.js app proxies `/api`, `/admin`, `/auth`, `/oauth2` and `/v1` to the gateway, so both cookies stay first-party.

### Signing in with GitHub or Google

Create an OAuth app with the callback `http://localhost:3000/login/oauth2/code/github` (GitHub) or `.../google` (Google), then give the gateway its credentials in a `docker-compose.override.yml` next to the main file:

```yaml
services:
  gateway:
    environment:
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENT_ID: your-client-id
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENT_SECRET: your-client-secret
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_REDIRECT_URI: http://localhost:3000/login/oauth2/code/github
```

Leave the variables out entirely when you don't use a provider: Spring Boot refuses to start with a blank client id. The login page only shows the buttons the gateway reports at `/auth/providers`.

---

## 3. The ten minute demo

### A normal request flows through and gets billed

```bash
curl -s http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer cp_demo_team_platform" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}],"max_tokens":64}'
```

### The headline: a stream is cut off the moment it would overspend

Give team `research` a budget that clears the pre flight estimate, which assumes a normal length answer, but cannot cover the very long generation that actually happens. This is exactly the under estimate case that mid stream cutoff exists for.

```bash
# scope_ref matches the team name the gateway stamps on usage
docker compose exec postgres psql -U costpilot -d costpilot -c \
  "insert into budget (scope_type, scope_ref, limit_amount) values ('team','research', 0.0013);"

# the mock upstream echoes the prompt back token by token, so a 2000 word prompt
# forces a 2000 token generation, and with no max_tokens the estimate assumes far less
PROMPT=$(printf 'lorem %.0s' $(seq 1 2000))
curl -sN http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer cp_demo_team_research" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}],\"stream\":true}" \
  | tail -5
```

Real chunks arrive for a few seconds, then the stream ends with a clean truncation: `"finish_reason":"budget_cutoff"` followed by `[DONE]`. Not a dropped socket. Only the tokens actually delivered are billed, and the overshoot is bounded to one streamed chunk.

### Once the budget is gone, the next request never leaves

```bash
curl -si http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer cp_demo_team_research" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}],"max_tokens":256}'
# HTTP 402  {"error":{"type":"budget_exceeded","code":"team",...}}
```

### Watch it happen

The [console](#2-the-console) at <http://localhost:3000> shows the same traffic per workspace: the blocked requests land in Blocked or held and in the request log. Open Grafana at <http://localhost:3300> for the ops view. Anonymous viewing is on, use `admin` / `admin` if you want to edit. The governance dashboard shows requests, spend, and the budget rejections you just caused.

Raw metrics: <http://localhost:9090>, or `curl localhost:8080/actuator/prometheus`.

### Spend analytics

Served from ClickHouse and reconciled against the Postgres ledger.

```bash
curl -s "http://localhost:8080/api/analytics/spend"     -H "Authorization: Bearer cp_admin_root"
curl -s "http://localhost:8080/api/analytics/reconcile" -H "Authorization: Bearer cp_admin_root"
```

Available under `/api/analytics/`: `spend`, `trends`, `top-spenders`, `decisions`, `budget-utilization`, `savings`, `reconcile`.

---

## 4. Admin CLI

Finance and platform people run the control plane without a frontend. `costpilot` is a standalone Picocli app that talks to the gateway over HTTP only, so it has no dependency on the server.

```bash
./gradlew :cli:installDist
export COSTPILOT_ENDPOINT=http://localhost:8080
export COSTPILOT_ADMIN_KEY=cp_admin_root      # dev key, mint a real one for prod

CLI=cli/build/install/costpilot/bin/costpilot
```

Governance config. Every write takes effect on the next request, with no redeploy, because the writes invalidate the relevant caches.

```bash
$CLI budget set --scope team --ref research --limit 25.00
$CLI policy set --scope-type team --scope-ref research \
      --allowed "gpt-4o-mini,claude-*" --fallback require_approval
$CLI budget ls
$CLI policy ls
```

Human in the loop approvals.

```bash
$CLI approvals ls
$CLI approvals approve <pending-id>
$CLI approvals reject  <pending-id> --reason "over quarter budget"
```

Spend, grouped by `team`, `project` or `model`.

```bash
$CLI spend show --group-by team
```

Every command has `--help`, exits non zero on failure, and reads the endpoint and key from flags or from `COSTPILOT_ENDPOINT` and `COSTPILOT_ADMIN_KEY`.

---

## 5. TypeScript SDK

`@costpilot/sdk` has no runtime dependencies and runs anywhere with `fetch` (Node 18+, Bun, Deno, edge, browsers).

```bash
npm install @costpilot/sdk
```

```ts
import { CostPilot, BudgetExceededError, PolicyDeniedError, ApprovalRequiredError } from "@costpilot/sdk";

const cp = new CostPilot({ apiKey: process.env.COSTPILOT_API_KEY, baseURL: "http://localhost:8080" });

try {
  const res = await cp.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
  console.log(res.choices[0].message.content, res.governance.modelDowngraded);
} catch (err) {
  if (err instanceof BudgetExceededError) console.log("blocked by", err.scope); // 402, nothing billed
  else if (err instanceof PolicyDeniedError) console.log("rule", err.ruleId);   // 403
  else if (err instanceof ApprovalRequiredError) console.log("held", err.approvalId); // 202
  else throw err;
}

const stream = await cp.chat.completions.stream({ model: "gpt-4o-mini", messages });
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta.content ?? "");
console.log(stream.budgetCutoff); // true if the gateway cut it short to keep a budget
```

Chat calls retry on connection errors, 408, 429 and 5xx, and reuse one `Idempotency-Key` across retries so the ledger charges once. With an admin key the same client manages the workspace: `cp.budgets`, `cp.policies`, `cp.approvals`, `cp.keys`, `cp.audit`, `cp.analytics`.

Full reference: [`sdk/typescript/`](../sdk/typescript/). Tests use a mocked `fetch`, so they need no gateway.

---

## 6. Python SDK

You can point a plain OpenAI SDK at the gateway and parse headers yourself, or use the client that surfaces the governance verdict as typed data.

```bash
pip install costpilot
```

```python
from costpilot import CostPilot, BudgetExceededError

cp = CostPilot(base_url="http://localhost:8080/v1", api_key="cp_...", team="research")

r = cp.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hi"}],
)

print(r.content)
print(r.governance.cache_hit, r.governance.budget_warning)
```

It exposes cache hits, budget warnings, model routing and downgrades, mid stream `budget_cutoff`, and typed errors such as `BudgetExceededError.scope`, `PolicyDeniedError.rule_id` and `ApprovalRequiredError`. Sync and async, one dependency (`httpx`).

Source, quickstart and streaming examples: [`sdk/python/`](../sdk/python/). Its tests run against a mocked transport, so they need no gateway and cost nothing.

---

## 7. Semantic cache

Off by default. It is a cost optimisation you opt into, not part of the governance guarantee.

```bash
COSTPILOT_CACHE_ENABLED=true docker compose up -d
```

When an incoming prompt is close enough to one already answered, CostPilot serves the stored response at zero provider cost and books the would be cost as savings.

- **How it decides.** Prompts are embedded by a deterministic local embedder, which means dev and tests make no network call and cost nothing, and stored in pgvector keyed by tenant and team. A lookup takes the nearest neighbour **inside the same tenant and team**, so tenants can never read each other's cache. The `Embedder` interface is the single place to swap in a real embedding provider.
- **Precision over recall.** A hit needs cosine similarity of at least **0.97** (`COSTPILOT_CACHE_SIMILARITY_THRESHOLD`). The threshold is deliberately strict: the cache would rather forward a borderline prompt than return a wrong answer. A hit sets `X-CostPilot-Cache: hit`.
- **Savings.** Every hit accrues `costpilot.cache.savings_nanos`. Grafana shows savings, hit ratio and hit/miss rate, and the figure reconciles against the hit log.
- **Lifetime is bounded.** An entry older than the TTL (`COSTPILOT_CACHE_TTL`, default `PT24H`) is never served (the lookup excludes past-TTL rows), and a scheduled sweep (`COSTPILOT_CACHE_EVICTION_INTERVAL_MS`, default 60s) deletes them so the table stays bounded. A semantic cache with no expiry would serve unboundedly stale answers as "free" and grow without limit; every other cache in the system already has a TTL, and now this one does too. Evictions are counted at `costpilot.cache.evictions` and the live entry count is the `costpilot.cache.size` gauge.

Streaming requests skip the cache, because a cached answer is a complete response.

---

## 8. Going live with real providers

Switching upstreams is configuration, never a code change.

```bash
COSTPILOT_UPSTREAM_MODE=real \
COSTPILOT_UPSTREAM_OPENAI_API_KEY=sk-... \
COSTPILOT_UPSTREAM_ANTHROPIC_API_KEY=sk-ant-... \
docker compose up -d
```

### Reproducible deploy profile, Gemini on Vertex AI

For a repeatable bring up where the credential is injected at runtime and never baked into the image, use the overlay plus a `.env`.

```bash
cp .env.example .env                        # project, pepper, credentials path
cp /path/to/service-account.json secrets/adc.json && chmod 644 secrets/adc.json
docker compose -f docker-compose.yml -f docker-compose.real.yml up --build -d
```

The overlay flips `COSTPILOT_UPSTREAM_MODE=real`, sets the Vertex flavor, project and location, mounts the service account JSON read only at `/var/secrets/adc.json` for ADC bearer auth, and overrides the dev pepper. The rest of the stack is inherited unchanged, so health, the ledger, Redis counters and `/actuator/prometheus` all populate against live traffic.

`.env` and `secrets/*.json` are gitignored, so no credential reaches git or the image.

### Pointing an app at it

Set `base_url` to `http://localhost:8080/v1` and use a CostPilot key as the bearer token. The provider is chosen by the model id, or by explicit config in `costpilot.upstream.model-providers`.

| model id starts with | goes to |
|---|---|
| `claude` | Anthropic |
| `gemini` | Gemini or Vertex |
| anything else | OpenAI |

---

## 9. Response headers and errors

What the gateway tells your client about the decision it made.

| header | meaning |
|---|---|
| `X-CostPilot-Cache: hit` | served from the semantic cache, zero provider cost |
| `X-CostPilot-Model-Routed` | cost routing picked a different model, with the reason |
| `X-CostPilot-Model-Downgraded` | policy or budget pressure swapped the model, with the reason |
| `X-CostPilot-Budget-Warning` | soft limit, 20% or less remaining in some scope |

Request headers you can send:

| header | effect |
|---|---|
| `Authorization: Bearer cp_...` | required, this is your identity |
| `X-Team-ID` / `X-Project-ID` | honoured only for admin keys, ignored for team keys |
| `X-User-ID` / `X-Environment` | attribution only, no authority |
| `Idempotency-Key` | makes a retry replay safe in the ledger |
| `X-CostPilot-Min-Tier` | the quality bar cost routing must not go below |

Terminal outcomes:

| status | body | when |
|---|---|---|
| `200` | `chat.completion`, or SSE ending in `[DONE]` | normal |
| `402` | `{"error":{"type":"budget_exceeded","code":"<scope>"}}` | out of budget and nothing cheaper fits |
| `403` | `{"error":{"type":"policy_denied",...}}` | policy said no |
| `202` | `{"id":...,"state":"pending","expires_at":...}` | held for human approval, not forwarded |

---

## 10. Load test

One command runs the whole benchmark: stack up, budgets seeded, three k6 scenarios, then the claims are verified straight from the Postgres ledger.

```bash
bash loadtest/run.sh
```

Cost-savings benchmark (routing + semantic cache, also $0 mock):

```bash
bash loadtest/run-savings.sh
```

The scenarios are a 130 second warm soak at 30 req/s, then 100 req/s sustained for 30 seconds across 10 governed teams to measure guard latency, then 300 requests flooding 10 teams with tiny caps to test for overspend, then 10 concurrent long streams against cutoff sized caps to measure cutoff accuracy.

Guard quantiles are read from Prometheus at the measurement window, so the decaying summary cannot dilute them with cold start samples. Full results, the live Gemini run, and caveats: [BENCHMARK.md](BENCHMARK.md).

---

## 11. Development

```bash
./gradlew build     # compile, full test suite, coverage gate
./gradlew test      # tests only
./gradlew bootRun   # run on :8080, needs Postgres and Redis
```

- Tests do **not** need `docker compose up`. They start their own Postgres, Redis, Kafka and ClickHouse through Testcontainers. A working Docker daemon is required.
- Naming is a hard rule: `*Test` is a pure unit test with no containers, `*IT` is an integration test that needs them.
- 170+ tests run against the embedded mock upstream. Coverage gate: line 80%, branch 60%.
- CI runs the same build on every push and pull request.
- The build has two modules: the gateway at the root, and `cli/`, which is standalone and deliberately excluded from the coverage gate and the Docker image.

---

## 12. Releases

There is no version to bump by hand. The version comes from the git tag, so the jar, the image tag and the GitHub release cannot disagree about what they are.

```bash
git tag v1.2.3
git push origin v1.2.3
```

That triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml), which runs the full test and coverage gate again on the tagged commit, builds the image, **boots it against Postgres and Redis and asserts `/actuator/info` reports `1.2.3`**, and only then publishes.

What comes out:

```bash
docker pull ghcr.io/tanhoangkhoanguyen/costpilot:1.2.3
```

- **Image** on GHCR, tagged with the version and `latest`. The exact bytes that passed the boot check are the bytes pushed - the push step ships the tested image rather than rebuilding it.
- **Jar** and a **CycloneDX SBOM** attached to the GitHub release. The SBOM is generated from the image, so it covers base-image OS packages as well as application jars.
- **Build provenance**, signed and pushed to the registry alongside the image:

```bash
gh attestation verify oci://ghcr.io/tanhoangkhoanguyen/costpilot:1.2.3 \
  --repo tanhoangkhoanguyen/CostPilot
```

Between tags, the version resolves from `git describe`, so a dev build reports something honest like `1.2.3-4-gabc1234` rather than a stale `0.0.1-SNAPSHOT`. `/actuator/info` also carries the commit sha, which is what you actually want when a container is misbehaving and nobody remembers what shipped.

To exercise the whole pipeline without spending a version number, run the workflow manually (`workflow_dispatch`): it builds, boots, verifies and generates the SBOM, but publishes nothing.
