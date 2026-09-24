"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { usd, when } from "@/lib/format";
import { useWsKey } from "@/lib/session";
import type { AuditRow, Page } from "@/lib/types";

const DECISIONS = ["allow", "route", "downgrade", "deny", "require_approval"];

function tone(decision: string): "good" | "warn" | "bad" | "neutral" {
  if (decision === "deny") return "bad";
  if (decision === "downgrade" || decision === "require_approval") return "warn";
  if (decision === "route") return "good";
  return "neutral";
}

export default function AuditPage() {
  const [team, setTeam] = useState("");
  const [decision, setDecision] = useState("");
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({ page: String(page), size: "50" });
  if (team) params.set("teamId", team);
  if (decision) params.set("decision", decision);

  const rows = useQuery({
    queryKey: useWsKey("audit", team, decision, page),
    queryFn: () => api<Page<AuditRow>>(`/admin/audit?${params}`),
    placeholderData: keepPreviousData,
  });
  const data = rows.data;

  return (
    <>
      <PageHeader title="Request log" sub="Every governed request and why the gateway decided what it did. Newest first." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="w-48" placeholder="Filter by team" value={team} onChange={(e) => { setTeam(e.target.value); setPage(0); }} />
        <Select className="w-48" value={decision} onChange={(e) => { setDecision(e.target.value); setPage(0); }}>
          <option value="">All decisions</option>
          {DECISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        {data && data.content.length === 0 ? (
          <Empty title="No requests match" />
        ) : (
          <Table head={["When", "Team / project", "Model", "Decision", "Tokens", "Cost", "Reason"]}>
            {(data?.content ?? []).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-muted">{when(r.createdAt)}</Td>
                <Td className="mono text-xs">
                  {r.teamId}
                  {r.projectId && <span className="text-muted"> / {r.projectId}</span>}
                </Td>
                <Td className="mono text-xs">
                  {r.requestedModel}
                  {r.executedModel && r.executedModel !== r.requestedModel && <span className="text-muted"> to {r.executedModel}</span>}
                </Td>
                <Td>
                  <Badge tone={tone(r.decision)}>{r.decision}</Badge>
                  {r.finishReason === "budget_cutoff" && <span className="ml-1"><Badge tone="warn">cut off</Badge></span>}
                </Td>
                <Td className="tabular-nums text-muted">{r.inputTokens != null ? `${r.inputTokens} / ${r.outputTokens ?? 0}` : ""}</Td>
                <Td className="tabular-nums">{r.cost != null ? usd(r.cost, 6) : ""}</Td>
                <Td className="max-w-sm text-xs text-muted">{r.reason}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {data && data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted">
          <span>
            Page {data.number + 1} of {data.totalPages}
          </span>
          <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
      <ErrorNote error={rows.error} />
    </>
  );
}
