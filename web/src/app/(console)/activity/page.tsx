"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, Empty, ErrorNote, PageHeader, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { useWsKey } from "@/lib/session";
import type { Activity, Page } from "@/lib/types";

export default function ActivityPage() {
  const activity = useQuery({ queryKey: useWsKey("activity"), queryFn: () => api<Page<Activity>>("/admin/activity?size=100") });
  const rows = activity.data?.content ?? [];
  return (
    <>
      <PageHeader title="Activity" sub="Who changed budgets, policies, keys and approvals, and when." />
      <Card>
        {rows.length === 0 && !activity.isPending ? (
          <Empty title="No changes yet" />
        ) : (
          <Table head={["When", "Who", "Action", "Target", "Change"]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-muted">{when(a.createdAt)}</Td>
                <Td className="text-xs">{a.actor.replace(/^(user|key):/, "")}</Td>
                <Td className="mono text-xs">{a.action}</Td>
                <Td className="mono text-xs">
                  <span className="text-muted">{a.targetType}</span> {a.targetRef}
                </Td>
                <Td className="text-xs text-muted">
                  {a.oldValue ?? "none"} <span aria-hidden>-&gt;</span> {a.newValue ?? "none"}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <ErrorNote error={activity.error} />
    </>
  );
}
