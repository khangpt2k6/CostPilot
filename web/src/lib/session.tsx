"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, getWorkspaceId, setWorkspaceId } from "./api";
import type { Me, Workspace } from "./types";

interface Session {
  me: Me;
  workspace: Workspace | null;
  canAdmin: boolean;
  switchWorkspace: (id: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function useMeQuery() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me", { workspace: false }), retry: false });
}

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => getWorkspaceId());

  const workspace = useMemo(
    () => me.workspaces.find((w) => w.id === selected) ?? me.workspaces[0] ?? null,
    [me.workspaces, selected],
  );

  // keep storage in step with what we actually use (a stale id from another account is dropped)
  if (typeof window !== "undefined" && workspace && getWorkspaceId() !== workspace.id) {
    setWorkspaceId(workspace.id);
  }

  const switchWorkspace = useCallback(
    (id: string) => {
      setWorkspaceId(id);
      setSelected(id);
      // everything except "me" belongs to the old workspace
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [client],
  );

  const value = useMemo<Session>(
    () => ({ me, workspace, canAdmin: workspace?.role === "owner" || workspace?.role === "admin", switchWorkspace }),
    [me, workspace, switchWorkspace],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** Query keys are namespaced by workspace so switching never shows the old workspace's data. */
export function useWsKey(...parts: unknown[]) {
  const { workspace } = useSession();
  return [workspace?.id ?? "none", ...parts];
}
