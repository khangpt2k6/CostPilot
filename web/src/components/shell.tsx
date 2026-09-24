"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  Building2,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Rocket,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/quickstart", label: "Quickstart", icon: Rocket },
  { href: "/playground", label: "Playground", icon: SquareTerminal },
  { section: "Governance" },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/policies", label: "Policies", icon: ShieldCheck },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck },
  { section: "Workspace" },
  { href: "/keys", label: "API keys", icon: KeyRound },
  { href: "/teams", label: "Teams", icon: Building2 },
  { href: "/members", label: "Members", icon: Users },
  { href: "/audit", label: "Request log", icon: FileClock },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const { me, workspace, switchWorkspace } = useSession();

  async function logout() {
    await api("/auth/logout", { method: "POST", workspace: false }).catch(() => undefined);
    client.clear();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Gauge size={20} className="text-accent" />
          <span className="font-semibold tracking-tight">CostPilot</span>
        </div>

        <div className="px-3 pb-3">
          <select
            aria-label="Workspace"
            value={workspace?.id ?? ""}
            onChange={(e) => switchWorkspace(e.target.value)}
            className="h-9 w-full rounded-md border border-line bg-bg px-2 text-sm"
          >
            {me.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.role})
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((item, i) =>
            "section" in item ? (
              <p key={i} className="px-2 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
                {item.section}
              </p>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-ink hover:bg-bg",
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2 border-t border-line px-3 py-3">
          {me.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {me.user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.user.displayName}</p>
            <p className="truncate text-xs text-muted">{me.user.email}</p>
          </div>
          <button onClick={logout} className="rounded p-1.5 text-muted hover:bg-bg" aria-label="Log out" title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* narrow screens: a compact top bar instead of the sidebar */}
        <header className="flex items-center gap-2 overflow-x-auto border-b border-line bg-panel px-4 py-2 md:hidden">
          <Gauge size={18} className="shrink-0 text-accent" />
          {NAV.filter((n) => !("section" in n)).map((item) =>
            "href" in item ? (
              <Link key={item.href} href={item.href} className="shrink-0 rounded px-2 py-1 text-sm hover:bg-bg">
                {item.label}
              </Link>
            ) : null,
          )}
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
