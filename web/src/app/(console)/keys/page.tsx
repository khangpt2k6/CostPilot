"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";

import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { ApiKeyView, MintedKey, Team } from "@/lib/types";

export default function KeysPage() {
  const { canAdmin } = useSession();
  const client = useQueryClient();
  const key = useWsKey("keys");
  const keys = useQuery({ queryKey: key, queryFn: () => api<ApiKeyView[]>("/admin/keys") });
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState<MintedKey | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/admin/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  const rows = keys.data ?? [];
  return (
    <>
      <PageHeader
        title="API keys"
        sub="Keys authenticate your apps to the gateway and decide which team a request is billed to. The secret is shown once; only a hash is stored."
        action={
          canAdmin && (
            <Button variant="primary" onClick={() => setMinting(true)}>
              <Plus size={16} /> New key
            </Button>
          )
        }
      />
      <Card>
        {rows.length === 0 && !keys.isPending ? (
          <Empty title="No keys yet">Create one to start sending requests.</Empty>
        ) : (
          <Table head={["Name", "Key", "Team / project", "Access", "Created", ""]}>
            {rows.map((k) => (
              <tr key={k.id} className={k.revokedAt ? "opacity-50" : undefined}>
                <Td className="font-medium">{k.name}</Td>
                <Td className="mono text-xs text-muted">{k.prefix ? `${k.prefix}...` : "legacy key"}</Td>
                <Td>
                  <span className="mono">{k.team}</span>
                  {k.project && <span className="mono text-muted"> / {k.project}</span>}
                </Td>
                <Td>{k.admin ? <Badge tone="warn">admin</Badge> : <Badge>team</Badge>}</Td>
                <Td className="whitespace-nowrap text-muted">{when(k.createdAt)}</Td>
                <Td className="text-right">
                  {k.revokedAt ? (
                    <Badge tone="bad">revoked</Badge>
                  ) : (
                    canAdmin && (
                      <Button
                        variant="ghost"
                        className="text-danger"
                        onClick={() => {
                          if (confirm(`Revoke "${k.name}"? Apps using it will get 401 right away.`)) revoke.mutate(k.id);
                        }}
                      >
                        Revoke
                      </Button>
                    )
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="mt-3">
        <ErrorNote error={keys.error ?? revoke.error} />
      </div>
      {minting && (
        <MintDialog
          onClose={() => setMinting(false)}
          onMinted={(m) => {
            setMinting(false);
            setMinted(m);
            client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
      {minted && <SecretDialog minted={minted} onClose={() => setMinted(null)} />}
    </>
  );
}

function MintDialog({ onClose, onMinted }: { onClose: () => void; onMinted: (k: MintedKey) => void }) {
  const teams = useQuery({ queryKey: useWsKey("teams"), queryFn: () => api<Team[]>("/api/workspace/teams") });
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [admin, setAdmin] = useState(false);
  const mint = useMutation({
    mutationFn: () =>
      api<MintedKey>("/admin/keys", { method: "POST", body: { name: name.trim(), teamId: selectedTeam, projectId: projectId || null, admin } }),
    onSuccess: onMinted,
  });
  // default to the first team until the user picks one
  const selectedTeam = teamId || teams.data?.[0]?.id || "";
  const team = teams.data?.find((t) => t.id === selectedTeam);

  function submit(e: FormEvent) {
    e.preventDefault();
    mint.mutate();
  }

  return (
    <Modal title="New API key" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" hint="Where it's used, e.g. prod-chatbot or ci">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Team">
            <Select
              value={selectedTeam}
              onChange={(e) => {
                setTeamId(e.target.value);
                setProjectId("");
              }}
              required
            >
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Any</option>
              {(team?.projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} className="mt-0.5" />
          <span>
            Admin key
            <span className="block text-xs text-muted">Can manage budgets, policies and keys, and bill any team via X-Team-ID. Keep it out of apps.</span>
          </span>
        </label>
        <ErrorNote error={mint.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={mint.isPending || !selectedTeam}>
            Create key
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SecretDialog({ minted, onClose }: { minted: MintedKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(minted.key);
    setCopied(true);
  }
  return (
    <Modal title={`Key "${minted.name}" created`} open onClose={onClose}>
      <p className="text-sm text-muted">Copy it now. You won&apos;t be able to see it again.</p>
      <div className="flex items-center gap-2 rounded-md border border-line bg-bg p-2">
        <code className="min-w-0 flex-1 break-all text-xs">{minted.key}</code>
        <Button variant="ghost" onClick={copy} aria-label="Copy key">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </div>
      <p className="text-sm">
        Next: send a request from the{" "}
        <Link href="/playground" className="text-accent underline" onClick={onClose}>
          playground
        </Link>{" "}
        or follow the{" "}
        <Link href="/quickstart" className="text-accent underline" onClick={onClose}>
          quickstart
        </Link>
        .
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
