"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";

import { Button, ErrorNote } from "@/components/ui";
import { ApiError, api, primeCsrf, setWorkspaceId } from "@/lib/api";
import type { Workspace } from "@/lib/types";

interface Preview {
  workspaceName: string;
  role: string;
  status: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<Preview>(`/api/invites/${token}`, { workspace: false }),
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await primeCsrf();
      const ws = await api<Workspace>(`/api/invites/${token}/accept`, { method: "POST", workspace: false });
      setWorkspaceId(ws.id);
      await client.invalidateQueries({ queryKey: ["me"] });
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const p = preview.data;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Gauge className="text-accent" />
          <span className="text-lg font-semibold tracking-tight">CostPilot</span>
        </div>
        {preview.isPending && <p className="text-sm text-muted">Checking invite...</p>}
        {preview.isError && <p className="text-sm text-danger">This invite link is not valid.</p>}
        {p && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Join {p.workspaceName}</h1>
            <p className="mt-1 text-sm text-muted">You were invited as {p.role.toLowerCase()}.</p>
            {p.status === "pending" ? (
              <div className="mt-6 space-y-3">
                <ErrorNote error={error} />
                <Button variant="primary" className="w-full" onClick={accept} disabled={busy}>
                  {busy ? "Joining..." : "Accept invite"}
                </Button>
              </div>
            ) : (
              <p className="mt-6 text-sm text-danger">This invite is {p.status}. Ask for a new link.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
