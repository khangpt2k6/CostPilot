"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { usd } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { Policy, Team } from "@/lib/types";

const FALLBACK: Record<Policy["fallbackAction"], string> = {
  deny: "Deny",
  downgrade: "Downgrade",
  require_approval: "Hold for approval",
};

type Draft = {
  scopeType: string;
  scopeRef: string;
  allowedModels: string;
  fallbackAction: Policy["fallbackAction"];
  downgradeTo: string;
  thresholdUsd: string;
};

const EMPTY: Draft = { scopeType: "team", scopeRef: "", allowedModels: "", fallbackAction: "deny", downgradeTo: "", thresholdUsd: "" };

export default function PoliciesPage() {
  const { canAdmin } = useSession();
  const client = useQueryClient();
  const key = useWsKey("policies");
  const policies = useQuery({ queryKey: key, queryFn: () => api<Policy[]>("/admin/policies") });
  const [draft, setDraft] = useState<Draft | null>(null);

  const remove = useMutation({
    mutationFn: (p: Policy) =>
      api(`/admin/policies?scopeType=${encodeURIComponent(p.scopeType)}&scopeRef=${encodeURIComponent(p.scopeRef)}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  const rows = (policies.data ?? []).filter((p) => p.active);

  return (
    <>
      <PageHeader
        title="Policies"
        sub="Which models a team or project may call, and what happens otherwise. A project rule overrides its team's rule; no rule means any model is allowed. Changes apply on the next request."
        action={
          canAdmin && (
            <Button variant="primary" onClick={() => setDraft(EMPTY)}>
              <Plus size={16} /> New policy
            </Button>
          )
        }
      />
      <Card>
        {rows.length === 0 && !policies.isPending ? (
          <Empty title="No policies">Every team can call every model until you add one.</Empty>
        ) : (
          <Table head={["Scope", "Allowed models", "Otherwise", "Approval over", ""]}>
            {rows.map((p) => (
              <tr key={`${p.scopeType}:${p.scopeRef}`}>
                <Td>
                  <span className="text-muted">{p.scopeType}</span> <span className="mono">{p.scopeRef}</span>
                </Td>
                <Td className="mono text-xs">{p.allowedModels}</Td>
                <Td>
                  <Badge tone={p.fallbackAction === "deny" ? "bad" : p.fallbackAction === "downgrade" ? "warn" : "neutral"}>
                    {FALLBACK[p.fallbackAction]}
                  </Badge>
                  {p.downgradeTo && <span className="ml-1 mono text-xs text-muted">to {p.downgradeTo}</span>}
                </Td>
                <Td className="tabular-nums">{p.approvalThresholdNanos == null ? "" : usd(p.approvalThresholdNanos / 1e9)}</Td>
                <Td className="text-right">
                  {canAdmin && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            scopeType: p.scopeType,
                            scopeRef: p.scopeRef,
                            allowedModels: p.allowedModels,
                            fallbackAction: p.fallbackAction,
                            downgradeTo: p.downgradeTo ?? "",
                            thresholdUsd: p.approvalThresholdNanos == null ? "" : String(p.approvalThresholdNanos / 1e9),
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" className="text-danger" onClick={() => remove.mutate(p)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <ErrorNote error={policies.error ?? remove.error} />
      {draft && (
        <PolicyDialog
          initial={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </>
  );
}

function PolicyDialog({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const teams = useQuery({ queryKey: useWsKey("teams"), queryFn: () => api<Team[]>("/api/workspace/teams") });
  const editing = initial.scopeRef !== "";
  const save = useMutation({
    mutationFn: () =>
      api("/admin/policies", {
        method: "PUT",
        body: {
          scopeType: d.scopeType,
          scopeRef: d.scopeRef.trim(),
          allowedModels: d.allowedModels.trim(),
          fallbackAction: d.fallbackAction,
          downgradeTo: d.fallbackAction === "downgrade" ? d.downgradeTo.trim() : null,
          approvalThresholdNanos: d.thresholdUsd ? Math.round(Number(d.thresholdUsd) * 1e9) : null,
        },
      }),
    onSuccess: onSaved,
  });
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const projects = (teams.data ?? []).flatMap((t) => t.projects.map((p) => p.name));
  const options = d.scopeType === "team" ? (teams.data ?? []).map((t) => t.name) : [...new Set(projects)];

  return (
    <Modal title={editing ? "Edit policy" : "New policy"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Scope">
            <Select value={d.scopeType} onChange={(e) => set({ scopeType: e.target.value, scopeRef: "" })} disabled={editing}>
              <option value="team">Team</option>
              <option value="project">Project</option>
            </Select>
          </Field>
          <Field label={d.scopeType === "team" ? "Team" : "Project"}>
            <Select value={d.scopeRef} onChange={(e) => set({ scopeRef: e.target.value })} disabled={editing} required>
              <option value="">Choose</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {editing && !options.includes(d.scopeRef) && <option value={d.scopeRef}>{d.scopeRef}</option>}
            </Select>
          </Field>
        </div>
        <Field label="Allowed models" hint="Comma separated. A trailing * matches a prefix, e.g. gpt-4o-mini, claude-haiku-*">
          <Input value={d.allowedModels} onChange={(e) => set({ allowedModels: e.target.value })} required placeholder="gpt-4o-mini, gemini-2.5-flash" />
        </Field>
        <Field label="When a request asks for another model">
          <Select value={d.fallbackAction} onChange={(e) => set({ fallbackAction: e.target.value as Draft["fallbackAction"] })}>
            <option value="deny">Deny it (403)</option>
            <option value="downgrade">Run it on a cheaper model</option>
            <option value="require_approval">Hold it for an admin to approve</option>
          </Select>
        </Field>
        {d.fallbackAction === "downgrade" && (
          <Field label="Downgrade to">
            <Input value={d.downgradeTo} onChange={(e) => set({ downgradeTo: e.target.value })} required placeholder="gpt-4o-mini" />
          </Field>
        )}
        <Field label="Require approval above (USD, optional)" hint="Even an allowed model is held when its worst-case cost is above this.">
          <Input type="number" min="0" step="any" value={d.thresholdUsd} onChange={(e) => set({ thresholdUsd: e.target.value })} placeholder="0.50" />
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
