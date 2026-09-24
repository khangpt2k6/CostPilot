"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Card, CardHeader, Empty, ErrorNote, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession, useWsKey } from "@/lib/session";
import type { Team } from "@/lib/types";

export default function TeamsPage() {
  const { canAdmin } = useSession();
  const client = useQueryClient();
  const key = useWsKey("teams");
  const teams = useQuery({ queryKey: key, queryFn: () => api<Team[]>("/api/workspace/teams") });
  const [name, setName] = useState("");

  const createTeam = useMutation({
    mutationFn: () => api("/api/workspace/teams", { method: "POST", body: { name: name.trim() } }),
    onSuccess: () => {
      setName("");
      client.invalidateQueries({ queryKey: key });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    createTeam.mutate();
  }

  return (
    <>
      <PageHeader
        title="Teams & projects"
        sub="Spend is attributed to a team and optionally a project. A key belongs to one team; admin keys can bill another team with the X-Team-ID header."
      />
      {canAdmin && (
        <form onSubmit={submit} className="mb-6 flex max-w-md gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="new-team-name" pattern="[a-z0-9][a-z0-9_\-]{0,62}" title="lowercase letters, digits, - and _" required />
          <Button type="submit" variant="primary" disabled={createTeam.isPending}>
            Add team
          </Button>
        </form>
      )}
      <ErrorNote error={teams.error ?? createTeam.error} />
      <div className="grid gap-4 md:grid-cols-2">
        {(teams.data ?? []).map((t) => (
          <TeamCard key={t.id} team={t} canAdmin={canAdmin} onChanged={() => client.invalidateQueries({ queryKey: key })} />
        ))}
      </div>
      {teams.data?.length === 0 && (
        <Card>
          <Empty title="No teams" />
        </Card>
      )}
    </>
  );
}

function TeamCard({ team, canAdmin, onChanged }: { team: Team; canAdmin: boolean; onChanged: () => void }) {
  const [project, setProject] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/api/workspace/teams/${team.id}/projects`, { method: "POST", body: { name: project.trim() } }),
    onSuccess: () => {
      setProject("");
      onChanged();
    },
  });
  return (
    <Card>
      <CardHeader title={team.name} sub={`${team.projects.length} project${team.projects.length === 1 ? "" : "s"}`} />
      <ul className="divide-y divide-line">
        {team.projects.map((p) => (
          <li key={p.id} className="px-4 py-2 text-sm mono">
            {p.name}
          </li>
        ))}
      </ul>
      {canAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="flex gap-2 border-t border-line p-3"
        >
          <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="new-project" pattern="[a-z0-9][a-z0-9_\-]{0,62}" required />
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
      )}
      {add.error && (
        <div className="px-3 pb-3">
          <ErrorNote error={add.error} />
        </div>
      )}
    </Card>
  );
}
