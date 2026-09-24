"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, UserPlus } from "lucide-react";

import { Badge, Button, Card, CardHeader, Empty, ErrorNote, PageHeader, Select, Table, Td } from "@/components/ui";
import { api, setWorkspaceId } from "@/lib/api";
import { when } from "@/lib/format";
import { useSession, useWsKey } from "@/lib/session";
import type { Invite, Member } from "@/lib/types";

export default function MembersPage() {
  const { canAdmin, workspace, me } = useSession();
  const client = useQueryClient();
  const membersKey = useWsKey("members");
  const invitesKey = useWsKey("invites");
  const members = useQuery({ queryKey: membersKey, queryFn: () => api<Member[]>("/api/workspace/members") });
  const invites = useQuery({ queryKey: invitesKey, queryFn: () => api<Invite[]>("/api/workspace/invites"), enabled: canAdmin });
  const [inviteRole, setInviteRole] = useState("member");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    client.invalidateQueries({ queryKey: membersKey });
    client.invalidateQueries({ queryKey: invitesKey });
  };

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api(`/api/workspace/members/${userId}`, { method: "PATCH", body: { role } }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/api/workspace/members/${userId}`, { method: "DELETE" }),
    onSuccess: (_, userId) => {
      if (userId === me.user.id) {
        // we just left: this workspace id is no longer ours
        setWorkspaceId(null);
        window.location.assign("/");
      }
    },
    onSettled: refresh,
  });
  const createInvite = useMutation({
    mutationFn: () => api<{ token: string; url: string }>("/api/workspace/invites", { method: "POST", body: { role: inviteRole } }),
    onSuccess: (res) => {
      // the gateway only knows its configured base url; fall back to this origin
      setLink(res.url.startsWith("http") ? res.url : `${window.location.origin}/invite/${res.token}`);
      setCopied(false);
      refresh();
    },
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => api(`/api/workspace/invites/${id}`, { method: "DELETE" }),
    onSettled: refresh,
  });

  const isOwner = workspace?.role === "owner";

  return (
    <>
      <PageHeader
        title="Members"
        sub="Owners and admins manage budgets, policies, keys and people. Members can see everything in the workspace but change nothing."
      />
      <Card>
        <CardHeader title={`People in ${workspace?.name ?? "this workspace"}`} />
        <Table head={["Name", "Email", "Role", "Joined", ""]}>
          {(members.data ?? []).map((m) => {
            const self = m.userId === me.user.id;
            const role = m.role.toLowerCase();
            return (
              <tr key={m.userId}>
                <Td className="font-medium">
                  {m.displayName} {self && <span className="text-xs text-muted">(you)</span>}
                </Td>
                <Td className="text-muted">{m.email}</Td>
                <Td>
                  {canAdmin && !self && (isOwner || role !== "owner") ? (
                    <Select
                      className="w-32"
                      value={role}
                      onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}
                    >
                      {isOwner && <option value="owner">owner</option>}
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </Select>
                  ) : (
                    <Badge tone={role === "member" ? "neutral" : "good"}>{role}</Badge>
                  )}
                </Td>
                <Td className="text-muted">{when(m.joinedAt)}</Td>
                <Td className="text-right">
                  {(self || (canAdmin && (isOwner || role !== "owner"))) && (
                    <Button
                      variant="ghost"
                      className="text-danger"
                      onClick={() => {
                        if (confirm(self ? "Leave this workspace?" : `Remove ${m.displayName}?`)) remove.mutate(m.userId);
                      }}
                    >
                      {self ? "Leave" : "Remove"}
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <div className="mt-3">
        <ErrorNote error={members.error ?? changeRole.error ?? remove.error} />
      </div>

      {canAdmin && (
        <Card className="mt-6">
          <CardHeader title="Invite links" sub="Single use, valid for 7 days. Send the link any way you like." />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Select className="w-36" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">as member</option>
              <option value="admin">as admin</option>
            </Select>
            <Button variant="primary" onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
              <UserPlus size={16} /> Create link
            </Button>
          </div>
          {link && (
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-md border border-line bg-bg p-2">
              <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
              <Button
                variant="ghost"
                aria-label="Copy link"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
          )}
          {(invites.data ?? []).length === 0 ? (
            <Empty title="No invites yet" />
          ) : (
            <Table head={["Role", "Status", "Created", "Expires", ""]}>
              {(invites.data ?? []).map((i) => (
                <tr key={i.id}>
                  <Td>{i.role.toLowerCase()}</Td>
                  <Td>
                    <Badge tone={i.status === "pending" ? "good" : "neutral"}>{i.status}</Badge>
                  </Td>
                  <Td className="text-muted">{when(i.createdAt)}</Td>
                  <Td className="text-muted">{when(i.expiresAt)}</Td>
                  <Td className="text-right">
                    {i.status === "pending" && (
                      <Button variant="ghost" className="text-danger" onClick={() => revokeInvite.mutate(i.id)}>
                        Revoke
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <div className="px-4 pb-4">
            <ErrorNote error={createInvite.error ?? revokeInvite.error} />
          </div>
        </Card>
      )}
    </>
  );
}
