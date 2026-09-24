"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { usd } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { Budget, Team } from "@/lib/types";

const SCOPES = [
  { value: "team", label: "Team", hint: "Caps one team (the key's team, or X-Team-ID)." },
  { value: "project", label: "Project", hint: "Caps one project name." },
  { value: "model", label: "Model", hint: "Caps spend on one model across the workspace." },
  { value: "tenant", label: "Whole workspace", hint: "One cap for everything." },
];

export default function BudgetsPage() {
  const { canAdmin, workspace } = useSession();
  const client = useQueryClient();
  const key = useWsKey("budgets");
  const budgets = useQuery({ queryKey: key, queryFn: () => api<Budget[]>("/admin/budgets") });
  const [editing, setEditing] = useState<{ scope: string; ref: string; limit: string } | null>(null);

  const deactivate = useMutation({
    mutationFn: (b: Budget) =>
      api(`/admin/budgets?scope=${encodeURIComponent(b.scope)}&ref=${encodeURIComponent(b.ref)}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  const rows = (budgets.data ?? []).slice().sort((a, b) => Number(b.active) - Number(a.active) || a.ref.localeCompare(b.ref));

  return (
    <>
      <PageHeader
        title="Budgets"
        sub="Hard dollar caps. Every request reserves its worst-case cost atomically before it runs, so a burst of parallel calls can't overspend. Under 20% remaining, responses carry a warning."
        action={
          canAdmin && (
            <Button variant="primary" onClick={() => setEditing({ scope: "team", ref: "", limit: "" })}>
              <Plus size={16} /> New budget
            </Button>
          )
        }
      />
      <Card>
        {rows.length === 0 && !budgets.isPending ? (
          <Empty title="No budgets yet">Without a budget, spend is only observed, never blocked.</Empty>
        ) : (
          <Table head={["Scope", "Applies to", "Limit", "Remaining", "Used", "Status", ""]}>
            {rows.map((b) => {
              const used = b.remaining == null ? null : Math.max(0, 1 - b.remaining / b.limit);
              return (
                <tr key={`${b.scope}:${b.ref}`}>
                  <Td>{b.scope}</Td>
                  <Td className="mono">{b.ref}</Td>
                  <Td className="tabular-nums">{usd(b.limit)}</Td>
                  <Td className="tabular-nums">{b.remaining == null ? "" : usd(b.remaining)}</Td>
                  <Td className="tabular-nums">{used == null ? "" : `${(used * 100).toFixed(0)}%`}</Td>
                  <Td>
                    {!b.active ? (
                      <Badge>inactive</Badge>
                    ) : used != null && used >= 1 ? (
                      <Badge tone="bad">exhausted</Badge>
                    ) : used != null && used >= 0.8 ? (
                      <Badge tone="warn">near cap</Badge>
                    ) : (
                      <Badge tone="good">active</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {canAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setEditing({ scope: b.scope, ref: b.ref, limit: String(b.limit) })}>
                          {b.active ? "Edit" : "Reactivate"}
                        </Button>
                        {b.active && (
                          <Button variant="ghost" className="text-danger" onClick={() => deactivate.mutate(b)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <ErrorNote error={budgets.error ?? deactivate.error} />
      {editing && (
        <BudgetDialog
          initial={editing}
          tenantSlug={workspace?.slug ?? ""}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </>
  );
}

function BudgetDialog({
  initial,
  tenantSlug,
  onClose,
  onSaved,
}: {
  initial: { scope: string; ref: string; limit: string };
  tenantSlug: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState(initial.scope);
  const [ref, setRef] = useState(initial.ref);
  const [limit, setLimit] = useState(initial.limit);
  const teams = useQuery({ queryKey: useWsKey("teams"), queryFn: () => api<Team[]>("/api/workspace/teams") });
  const save = useMutation({
    mutationFn: () =>
      api("/admin/budgets", { method: "PUT", body: { scope, ref: scope === "tenant" ? tenantSlug : ref.trim(), limit: Number(limit) } }),
    onSuccess: onSaved,
  });
  const editingExisting = initial.ref !== "";

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal title={editingExisting ? "Edit budget" : "New budget"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Scope" hint={SCOPES.find((s) => s.value === scope)?.hint}>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} disabled={editingExisting}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        {scope === "team" && (
          <Field label="Team">
            <Select value={ref} onChange={(e) => setRef(e.target.value)} disabled={editingExisting} required>
              <option value="">Choose a team</option>
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
              {editingExisting && !(teams.data ?? []).some((t) => t.name === ref) && <option value={ref}>{ref}</option>}
            </Select>
          </Field>
        )}
        {(scope === "project" || scope === "model") && (
          <Field label={scope === "project" ? "Project name" : "Model"}>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} disabled={editingExisting} required placeholder={scope === "model" ? "gpt-4o" : "chatbot"} />
          </Field>
        )}
        <Field label="Limit (USD)">
          <Input type="number" min="0.000000001" step="any" value={limit} onChange={(e) => setLimit(e.target.value)} required placeholder="500" />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
