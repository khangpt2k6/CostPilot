"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BarList, SpendTrend, UtilizationList } from "@/components/charts";
import { Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { num, usd } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { AuditRow, BudgetUtilization, DecisionCounts, Page, Savings, SpendBucket, TrendPoint } from "@/lib/types";

const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
type Range = keyof typeof RANGES;

export default function OverviewPage() {
  const { workspace } = useSession();
  const [range, setRange] = useState<Range>("30d");
  const from = new Date(Date.now() - RANGES[range] * 86_400_000);
  from.setMinutes(0, 0, 0);
  const qs = `from=${from.toISOString()}`;

  const useA = <T,>(name: string, path: string) =>
    useQuery({ queryKey: useWsKey("analytics", name, range), queryFn: () => api<T>(`/api/analytics/${path}${path.includes("?") ? "&" : "?"}${qs}`) });

  const trend = useA<TrendPoint[]>("trend", "trends?interval=day");
  const byTeam = useA<SpendBucket[]>("team", "spend?groupBy=team");
  const byModel = useA<SpendBucket[]>("model", "spend?groupBy=model");
  const decisions = useA<DecisionCounts>("decisions", "decisions");
  const savings = useA<Savings>("savings", "savings");
  const budgets = useA<BudgetUtilization[]>("budgets", "budget-utilization?scope=team");
  // blocked and held requests never reach the ledger, so the analytics pipeline doesn't see
  // them; the per-request audit log does
  const useAuditCount = (decision: string) =>
    useQuery({
      queryKey: useWsKey("audit-count", decision, range),
      queryFn: () => api<Page<AuditRow>>(`/admin/audit?decision=${decision}&size=1&${qs}`),
      select: (p) => p.totalElements,
    });
  const denied = useAuditCount("deny");
  const held = useAuditCount("require_approval");

  if (trend.error instanceof ApiError && trend.error.status === 404) {
    return (
      <>
        <PageHeader title="Overview" />
        <Card>
          <Empty title="Analytics is turned off on this gateway">
            Spend charts read from ClickHouse. Start the full stack with <code>docker compose up</code>, or set
            COSTPILOT_CLICKHOUSE_ENABLED=true. Budgets, policies and keys work without it.
          </Empty>
        </Card>
      </>
    );
  }

  const totalRequests = (byTeam.data ?? []).reduce((n, b) => n + b.requests, 0);
  const d = decisions.data;
  const deniedN = denied.data ?? 0;
  const heldN = held.data ?? 0;
  const governed = (d ? d.downgrade + d.route + d.cutoff : 0) + deniedN + heldN;
  const noTraffic = trend.isSuccess && byTeam.isSuccess && totalRequests === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`Spend and governance decisions for ${workspace?.name ?? "this workspace"}.`}
        action={
          <div className="inline-flex rounded-md border border-line bg-panel p-0.5" role="group" aria-label="Time range">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded px-3 py-1 text-sm ${r === range ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      {noTraffic && (
        <Card className="mb-6 border-dashed">
          <Empty title="No traffic yet">
            Mint a key and send your first request through the gateway. <Link href="/quickstart" className="text-accent underline">Open the quickstart</Link>.
          </Empty>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spend" value={usd(savings.data?.actualSpendUsd)} sub={`last ${range}`} />
        <Stat label="Requests served" value={num(totalRequests)} sub={`${num(governed)} changed, blocked or held`} />
        <Stat
          label="Saved"
          value={usd(savings.data?.totalSavingsUsd)}
          sub={savings.data?.percentSaved != null ? `${savings.data.percentSaved}% vs. unrouted` : "routing + cache"}
        />
        <Stat
          label="Blocked or held"
          value={num(deniedN + heldN)}
          sub={`${num(deniedN)} blocked by budget or policy, ${num(heldN)} held for approval`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="Daily spend" sub="USD per day, settled cost from the ledger pipeline" />
        <div className="p-4">
          {trend.data && trend.data.length > 0 ? <SpendTrend points={trend.data} from={from} /> : <Empty title="No spend in this range" />}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spend by team" />
          <div className="p-4">
            <SpendList rows={byTeam.data} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Spend by model" sub="The model that actually ran, after any downgrade" />
          <div className="p-4">
            <SpendList rows={byModel.data} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Decisions" sub="What the gateway did with each request" />
          <div className="p-4">
            {d ? (
              <BarList
                rows={[
                  { key: "Allowed", value: d.allow, detail: num(d.allow) },
                  { key: "Routed to a cheaper model", value: d.route, detail: num(d.route) },
                  { key: "Downgraded (budget/policy)", value: d.downgrade, detail: num(d.downgrade) },
                  { key: "Cut off mid-stream", value: d.cutoff, detail: num(d.cutoff) },
                  { key: "Held for approval", value: heldN, detail: num(heldN) },
                  { key: "Blocked (budget or policy)", value: deniedN, detail: num(deniedN) },
                ]}
              />
            ) : (
              <Empty title="No data" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Team budgets"
            action={
              <Link href="/budgets" className="text-xs text-accent hover:underline">
                Manage
              </Link>
            }
          />
          <div className="p-4">
            {budgets.data && budgets.data.length > 0 ? (
              <UtilizationList rows={budgets.data} />
            ) : (
              <Empty title="No team budgets">Set a cap so runaway spend gets blocked, not billed.</Empty>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function SpendList({ rows }: { rows: SpendBucket[] | undefined }) {
  if (!rows || rows.length === 0) return <Empty title="No spend in this range" />;
  const top = rows.slice(0, 8);
  return (
    <BarList
      rows={top.map((b) => ({ key: b.key, value: Number(b.costUsd), detail: `${usd(b.costUsd)} · ${num(b.requests)} req` }))}
    />
  );
}
