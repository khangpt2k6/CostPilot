import { isoTime, type HttpCore } from "../core.js";
import type {
  ApiKey,
  AuditRecord,
  Budget,
  BudgetScope,
  BudgetUtilization,
  CreatedApiKey,
  DecisionCounts,
  Page,
  PendingApproval,
  Policy,
  PolicyUpsert,
  SavingsSummary,
  SpendBucket,
  TimeWindow,
  TopSpender,
  TrendPoint,
} from "../types.js";

// Admin surfaces need an admin key; a team key gets PolicyDeniedError (403). Every call is
// confined to the key's own workspace by the gateway.

export class Budgets {
  constructor(private readonly core: HttpCore) {}

  async list(): Promise<Budget[]> {
    return (await this.core.call<Budget[]>("GET", "/admin/budgets")).data;
  }

  /** create or change a cap; it enforces on the very next request */
  async upsert(budget: { scope: BudgetScope; ref: string; limit: number }): Promise<Budget> {
    return (await this.core.call<Budget>("PUT", "/admin/budgets", { body: budget })).data;
  }

  async remove(scope: BudgetScope, ref: string): Promise<void> {
    await this.core.call("DELETE", "/admin/budgets", { query: { scope, ref } });
  }
}

export class Policies {
  constructor(private readonly core: HttpCore) {}

  async list(): Promise<Policy[]> {
    return (await this.core.call<Policy[]>("GET", "/admin/policies")).data;
  }

  async upsert(policy: PolicyUpsert): Promise<Policy> {
    const body = {
      scopeType: policy.scopeType,
      scopeRef: policy.scopeRef,
      allowedModels: Array.isArray(policy.allowedModels) ? policy.allowedModels.join(",") : policy.allowedModels,
      fallbackAction: policy.fallbackAction,
      downgradeTo: policy.downgradeTo ?? null,
      approvalThresholdNanos:
        policy.approvalThresholdUsd === undefined ? null : Math.round(policy.approvalThresholdUsd * 1e9),
    };
    return (await this.core.call<Policy>("PUT", "/admin/policies", { body })).data;
  }

  async remove(scopeType: "team" | "project", scopeRef: string): Promise<void> {
    await this.core.call("DELETE", "/admin/policies", { query: { scopeType, scopeRef } });
  }
}

export class Approvals {
  constructor(private readonly core: HttpCore) {}

  async list(): Promise<PendingApproval[]> {
    return (await this.core.call<PendingApproval[]>("GET", "/admin/approvals")).data;
  }

  async get(id: string): Promise<PendingApproval> {
    return (await this.core.call<PendingApproval>("GET", `/admin/approvals/${encodeURIComponent(id)}`)).data;
  }

  /** replays the parked request and returns its chat completion; 409 if already decided */
  async approve(id: string): Promise<unknown> {
    return (await this.core.call("POST", `/admin/approvals/${encodeURIComponent(id)}/approve`, { retryable: false })).data;
  }

  async reject(id: string, reason?: string): Promise<PendingApproval> {
    return (
      await this.core.call<PendingApproval>("POST", `/admin/approvals/${encodeURIComponent(id)}/reject`, {
        body: { reason: reason ?? null },
        retryable: false,
      })
    ).data;
  }
}

export class Keys {
  constructor(private readonly core: HttpCore) {}

  async list(): Promise<ApiKey[]> {
    return (await this.core.call<ApiKey[]>("GET", "/admin/keys")).data;
  }

  /** the returned `key` is the only time the secret is ever visible */
  async create(params: { teamId: string; projectId?: string; name?: string; admin?: boolean }): Promise<CreatedApiKey> {
    return (await this.core.call<CreatedApiKey>("POST", "/admin/keys", { body: params, retryable: false })).data;
  }

  async revoke(id: string): Promise<void> {
    await this.core.call("DELETE", `/admin/keys/${encodeURIComponent(id)}`);
  }
}

export class Audit {
  constructor(private readonly core: HttpCore) {}

  /** the per-request decision log, newest first. A team key only ever sees its own team. */
  async list(
    filters: TimeWindow & { teamId?: string; projectId?: string; decision?: string; page?: number; size?: number } = {},
  ): Promise<Page<AuditRecord>> {
    const { from, to, ...rest } = filters;
    return (await this.core.call<Page<AuditRecord>>("GET", "/admin/audit", { query: { ...rest, from: isoTime(from), to: isoTime(to) } })).data;
  }
}

type Dimension = "team" | "project" | "model" | "user";

/** Spend analytics (needs the gateway's ClickHouse pipeline). Windows default to the last 30 days. */
export class Analytics {
  constructor(private readonly core: HttpCore) {}

  async spend(params: TimeWindow & { groupBy?: Dimension } = {}): Promise<SpendBucket[]> {
    return this.get("spend", { groupBy: params.groupBy }, params);
  }

  async topSpenders(params: TimeWindow & { dimension?: Dimension; limit?: number } = {}): Promise<TopSpender[]> {
    return this.get("top-spenders", { dimension: params.dimension, limit: params.limit }, params);
  }

  async decisions(params: TimeWindow = {}): Promise<DecisionCounts> {
    return this.get("decisions", {}, params);
  }

  async trends(params: TimeWindow & { interval?: "day" | "hour" } = {}): Promise<TrendPoint[]> {
    return this.get("trends", { interval: params.interval }, params);
  }

  async budgetUtilization(params: TimeWindow & { scope?: "team" | "project" } = {}): Promise<BudgetUtilization[]> {
    return this.get("budget-utilization", { scope: params.scope }, params);
  }

  async savings(params: TimeWindow = {}): Promise<SavingsSummary> {
    return this.get("savings", {}, params);
  }

  private async get<T>(path: string, query: Record<string, string | number | undefined>, window: TimeWindow): Promise<T> {
    return (
      await this.core.call<T>("GET", `/api/analytics/${path}`, {
        query: { ...query, from: isoTime(window.from), to: isoTime(window.to) },
      })
    ).data;
  }
}
