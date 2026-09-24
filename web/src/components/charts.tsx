"use client";

import clsx from "clsx";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { usd } from "@/lib/format";
import type { BudgetUtilization, TrendPoint } from "@/lib/types";

// Single series, so no legend: the card title names it. One hue, recessive grid, a
// crosshair tooltip carrying exact values.
export function SpendTrend({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({ day: p.bucket, cost: Number(p.costUsd), requests: p.requests }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-chart)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => usd(v, v < 1 ? 2 : 0)}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { day: string; cost: number; requests: number };
              return (
                <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium">{new Date(row.day).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                  <p className="mt-1 tabular-nums">{usd(row.cost)} spent</p>
                  <p className="tabular-nums text-muted">{row.requests.toLocaleString()} requests</p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="cost" stroke="var(--color-chart)" strokeWidth={2} fill="url(#spendFill)" activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Ranked horizontal bars in plain HTML: label and value in text ink, the bar carries
// magnitude only. Hover shows the exact figures.
export function BarList({ rows }: { rows: { key: string; value: number; detail: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.key}: ${r.detail}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.key || "(none)"}</span>
            <span className="shrink-0 tabular-nums text-muted">{r.detail}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg">
            <div
              className="h-1.5 rounded-full bg-chart transition-opacity group-hover:opacity-80"
              style={{ width: `${max > 0 ? Math.max((r.value / max) * 100, 1.5) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Utilization uses the reserved status tones and always prints the percentage, so state is
// never carried by color alone.
export function UtilizationList({ rows }: { rows: BudgetUtilization[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = r.utilization == null ? 0 : r.utilization * 100;
        const tone = pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok";
        return (
          <li key={r.scopeRef}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.scopeRef}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {usd(r.spentUsd)} of {usd(r.limitUsd)}{" "}
                <span className={clsx(tone === "bad" && "text-danger", tone === "warn" && "text-warn")}>
                  ({pct.toFixed(0)}%{tone === "bad" ? ", over" : tone === "warn" ? ", near cap" : ""})
                </span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg">
              <div
                className={clsx(
                  "h-1.5 rounded-full",
                  tone === "bad" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-chart",
                )}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
