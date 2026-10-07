<div align="center">

<img src="docs/Avatar_Costpilot.png" width="160" alt="CostPilot mascot: a small robot in a pilot cap holding a magnifying glass over a spending chart">

# CostPilot

**An LLM spending gateway that enforces budgets before the money is spent, not after the bill arrives.**

[![CI](https://github.com/khangpt2k6/CostPilot/actions/workflows/ci.yml/badge.svg)](https://github.com/khangpt2k6/CostPilot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/khangpt2k6/CostPilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/khangpt2k6/CostPilot/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/khangpt2k6/CostPilot?sort=semver)](https://github.com/khangpt2k6/CostPilot/releases)
![Java 21](https://img.shields.io/badge/Java-21-5382A1?logo=openjdk&logoColor=white)
![Spring Boot 3.5](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-console-000000?logo=nextdotjs&logoColor=white)

[Documentation](docs/README.md) · [Console](docs/README.md#2-the-console) · [TypeScript SDK](sdk/typescript/) · [Python SDK](sdk/python/) · [Benchmarks](docs/BENCHMARK.md)

</div>

---

## Overview

Teams adopting LLMs usually find out what they spent when the invoice lands. CostPilot sits between your applications and the model providers, speaks the OpenAI API, and makes a spending decision on every request: allow it, route it to a cheaper model, hold it for approval, or refuse it. Streams that would overrun a budget are cut off mid generation, so the cap is a real cap.

Point any OpenAI compatible client at the gateway and governance applies with no code changes. Use the SDKs when you want the gateway's verdict back as typed data.

## Features

| | |
|---|---|
| **Hard budgets** | Dollar caps per workspace, team and project. The worst case cost is reserved before a request leaves, across every scope that governs it. |
| **Mid stream cutoff** | A streamed response that would breach its budget ends cleanly with `budget_cutoff` and `[DONE]`. Only delivered tokens are billed. |
| **Policies** | Model allow lists, automatic downgrades, and human approval for requests above a cost threshold. |
| **Cost based routing** | Sends each request to the cheapest model that still meets the quality bar the caller asked for. |
| **Semantic cache** | Prompts close enough to one already answered are served from pgvector at zero cost. |
| **Exact ledger** | Every charge is written once from provider reported token counts, even when the client disconnects. |
| **Multi tenant console** | GitHub or Google sign in, workspaces with Owner, Admin and Member roles, invites, API keys, approvals and spend analytics. |
| **Observability** | Prometheus metrics, a Grafana governance dashboard, ClickHouse analytics and an audit row explaining every verdict. |
| **Providers** | OpenAI, Anthropic, Gemini (including Vertex AI), plus a built in mock for free local testing. |

## Architecture

Every request passes through ten steps. The diagram below follows one live request through the pipeline.

<p align="center">
  <img src="docs/diagram.gif" alt="A live request moving through the CostPilot pipeline: auth, normalize, policy, cache, route, budget, forward, meter, ledger, settle" width="100%">
</p>

| # | Step | Responsibility |
|:---:|---|---|
| 1 | **Auth** | Identify the caller from a hashed API key, never from a client supplied header |
| 2 | **Normalize** | Convert the OpenAI shaped request into one internal representation |
| 3 | **Policy** | Allow, deny, downgrade, or hold the request for a human |
| 4 | **Cache** | Serve a semantically equivalent earlier answer at no cost |
| 5 | **Route** | Pick the cheapest model that satisfies the requested quality |
| 6 | **Budget** | Reserve the worst case cost against every applicable budget |
| 7 | **Forward** | Call OpenAI, Anthropic, Gemini, or the built in mock |
| 8 | **Meter** | Track spend while the response streams and cut off on breach |
| 9 | **Ledger** | Record the real charge exactly once |
| 10 | **Settle** | Release the reservation, publish events, and write the audit row |

## Console

Budgets and policies only help if the people paying the bill can see and change them. The console is a multi user web app on top of the gateway for minting keys, setting caps, approving held requests and tracking spend by team and model.

<p align="center">
  <img src="docs/console-overview.png" alt="CostPilot console overview: spend KPIs, daily spend chart, spend by team and model, governance decisions and team budget utilization" width="100%">
</p>

Each workspace is a hard tenant boundary. Two workspaces can both have a team called `platform` and never share a budget counter, policy, approval or analytics row. An integration test enforces this.

## Quickstart

The only requirement is Docker. The demo is free because the default upstream is a mock provider that runs inside the gateway.

```bash
git clone https://github.com/khangpt2k6/CostPilot.git
cd CostPilot
docker compose up --build -d
```

The first boot takes two to three minutes. Then:

| Service | URL |
|---|---|
| Console | <http://localhost:3000> (sign in with any email, local dev login) |
| Gateway API | <http://localhost:8080/v1> |
| Grafana | <http://localhost:3300> |
| Prometheus | <http://localhost:9090> |

Send a request through the gateway with any OpenAI compatible client:

```bash
curl -s http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer cp_demo_team_platform" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}],"max_tokens":64}'
```

Or use an SDK to get the governance verdict back as typed data:

```ts
import { CostPilot } from "@costpilot/sdk";

const cp = new CostPilot({ apiKey: "cp_demo_team_platform", baseURL: "http://localhost:8080" });
const res = await cp.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
res.governance; // { modelDowngraded, modelRouted, budgetWarning, cacheHit }
```

```python
from costpilot import CostPilot

cp = CostPilot(base_url="http://localhost:8080/v1", api_key="cp_demo_team_platform")
r = cp.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": "hi"}])
print(r.governance.cache_hit, r.governance.budget_warning)
```

The [ten minute demo](docs/README.md#3-the-ten-minute-demo) walks through a mid stream cutoff and a hard block step by step.

## Benchmarks

All figures are reconciled from the Postgres ledger and Prometheus, not from load generator output. Full methodology and reproduction steps are in [docs/BENCHMARK.md](docs/BENCHMARK.md).

| Measurement | Result |
|---|---|
| Overspend by teams under a concurrent flood | **0** (mock 0/30, live Vertex: no breach) |
| Overshoot past the cap on a live Gemini stream | **One provider chunk** (about 53 tokens) |
| Budget guard decision latency, p99 at 100 req/s | **About 14 ms** |
| Billing accuracy | Provider reported tokens × published price, exact |

## Concurrency guarantees, in plain English

Many requests hit CostPilot in the same instant and real money is involved, so the hard questions are about races: two things happening at once that each look fine alone. Each row below is one thing that could go wrong, how it is prevented, and the test that proves it.

| What could go wrong | How CostPilot prevents it | Proof |
|---|---|---|
| 100 requests hit the same team budget at once and together spend more than the cap | Spend is reserved up front inside one atomic Redis Lua script (subtract, roll back if it went negative). There is no gap between "check the budget" and "charge it" for another request to slip through | `BudgetGuardIT.twelveHundredSimultaneousRequestsOnVirtualThreadsNeverOverspendAnyTeam`: 12 teams, 1,200 requests on virtual threads, zero overspend |
| A client times out, retries, and the same request is billed twice | Every request carries an idempotency key backed by a unique constraint in Postgres. The database decides who wins the insert; the loser sees the row already exists and charges nothing | `UsageLedgerServiceIT.everyRequestIsBilledExactlyOnceWhenClientsRetryAfterTimeouts`: 40 requests retried 5 times each, 40 rows, 40 charges |
| An admin approves a parked request at the exact moment the background sweeper expires it, so it is forwarded (money spent) and then overwritten as expired | A decision is claimed with a conditional `UPDATE ... WHERE state = 'pending'` before anything is forwarded. The second writer updates zero rows and is refused, so exactly one decision wins and an expired request never costs anything | `ApprovalDecisionRaceIT`: approve vs expire, approve vs reject, 16 admins rejecting at once |
| A stream keeps generating after the budget is gone | Cost is metered per chunk and the stream is cut within one chunk of crossing the cap, with a compare-and-set so the cutoff is recorded exactly once | Measured on a live Gemini stream in [docs/BENCHMARK.md](docs/BENCHMARK.md) |

## Documentation

| Guide | Contents |
|---|---|
| [Run it](docs/README.md#1-run-it) | The full stack, seeded keys and services |
| [Console](docs/README.md#2-the-console) | Sign in, workspaces, roles, invites, OAuth setup |
| [Admin CLI](docs/README.md#4-admin-cli) | Budgets, policies, approvals and spend from the terminal |
| [TypeScript SDK](docs/README.md#5-typescript-sdk) / [Python SDK](docs/README.md#6-python-sdk) | Typed governance outcomes, streaming, admin API |
| [Semantic cache](docs/README.md#7-semantic-cache) | Configuration and behavior |
| [Going live](docs/README.md#8-going-live-with-real-providers) | OpenAI, Anthropic, and Gemini on Vertex AI |
| [Headers and errors](docs/README.md#9-response-headers-and-errors) | What the gateway returns to clients |
| [Development](docs/README.md#11-development) | Build, test and the coverage gate |
| [Releases](docs/README.md#12-releases) | Versioning, container image, SBOM and provenance |

## Tech stack

| Layer | Technology |
|---|---|
| Gateway | Java 21, Spring Boot 3.5 (WebFlux client), Spring Security |
| Storage | PostgreSQL with pgvector (ledger, budgets, cache), Redis (budget counters) |
| Events and analytics | Kafka, ClickHouse |
| Console | Next.js, React, TanStack Query, Tailwind CSS, Recharts |
| Clients | TypeScript SDK, Python SDK, admin CLI |
| Operations | Docker Compose, Prometheus, Grafana, GitHub Actions, Trivy, CodeQL |

## Project layout

```
src/                 gateway source
web/                 console (Next.js), built as its own image
cli/                 admin CLI (Gradle subproject)
sdk/typescript/      TypeScript client
sdk/python/          Python client
docker/              Dockerfile and service configuration
docs/                documentation and benchmark results
loadtest/            k6 load tests
gradle/              build guards (coverage, package cycles, versioning)
```

Gradle and Compose entry points (`settings.gradle`, `build.gradle`, `docker-compose*.yml`) stay at the root because both tools discover them from the working directory.

## Development

```bash
./gradlew build                 # gateway: tests, coverage gate, architecture checks
cd web && npm ci && npm run typecheck && npm run build    # console
```

Integration tests use Testcontainers, so Docker must be running. See [Development](docs/README.md#11-development) for details.

---

<div align="center">
<sub>Built because a dashboard has never stopped a single dollar from leaving.</sub>
</div>
