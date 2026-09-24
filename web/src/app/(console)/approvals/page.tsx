"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Card, Empty, ErrorNote, PageHeader, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, usd, when } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { Approval } from "@/lib/types";

export default function ApprovalsPage() {
  const { canAdmin } = useSession();
  const client = useQueryClient();
  const key = useWsKey("approvals");
  const approvals = useQuery({ queryKey: key, queryFn: () => api<Approval[]>("/admin/approvals"), refetchInterval: 10_000 });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api(`/admin/approvals/${id}/${action}`, { method: "POST", body: action === "reject" ? { reason: "rejected in console" } : undefined }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const rows = approvals.data ?? [];
  return (
    <>
      <PageHeader
        title="Approvals"
        sub="Requests a policy held for a human decision. Approving replays the original request through the gateway and bills it normally; rejecting never calls the model. Unanswered requests expire."
      />
      <Card>
        {rows.length === 0 && !approvals.isPending ? (
          <Empty title="Nothing waiting">Held requests show up here within a few seconds.</Empty>
        ) : (
          <Table head={["Requested", "Team", "Model", "Worst-case cost", "Why", "Expires", ""]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-muted">{ago(a.createdAt)}</Td>
                <Td className="mono">{a.team}</Td>
                <Td className="mono whitespace-nowrap">{a.requestedModel}</Td>
                <Td className="tabular-nums">{a.estimateNanos == null ? "" : usd(a.estimateNanos / 1e9)}</Td>
                <Td className="max-w-xs text-xs text-muted">{a.reason}</Td>
                <Td className="whitespace-nowrap text-muted">{when(a.expiresAt)}</Td>
                <Td className="text-right">
                  {canAdmin && (
                    <div className="flex justify-end gap-1">
                      <Button variant="primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, action: "approve" })}>
                        Approve
                      </Button>
                      <Button variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, action: "reject" })}>
                        Reject
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="mt-3">
        <ErrorNote error={approvals.error ?? decide.error} />
      </div>
    </>
  );
}
