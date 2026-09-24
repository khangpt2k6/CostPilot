"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Workspace } from "@/lib/types";

export default function SettingsPage() {
  const { workspace, canAdmin, switchWorkspace } = useSession();
  const client = useQueryClient();
  const [name, setName] = useState(workspace?.name ?? "");
  const [newName, setNewName] = useState("");

  const rename = useMutation({
    mutationFn: () => api("/api/workspace", { method: "PATCH", body: { name: name.trim() } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["me"] }),
  });
  const create = useMutation({
    mutationFn: () => api<Workspace>("/api/workspaces", { method: "POST", body: { name: newName.trim() } }),
    onSuccess: async (ws) => {
      setNewName("");
      await client.invalidateQueries({ queryKey: ["me"] });
      switchWorkspace(ws.id);
    },
  });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="This workspace" sub={`ID ${workspace?.id}. Ledger name ${workspace?.slug}.`} />
          <form
            className="space-y-3 p-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              rename.mutate();
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canAdmin} required />
            </Field>
            <ErrorNote error={rename.error} />
            {canAdmin && (
              <Button type="submit" variant="primary" disabled={rename.isPending}>
                Save
              </Button>
            )}
          </form>
        </Card>
        <Card>
          <CardHeader title="New workspace" sub="A separate set of teams, keys, budgets and people. You'll be its owner." />
          <form
            className="space-y-3 p-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Name">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme AI" required />
            </Field>
            <ErrorNote error={create.error} />
            <Button type="submit" disabled={create.isPending}>
              Create workspace
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
