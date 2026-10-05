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
  Menu,
  Rocket,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme";
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
  const [drawer, setDrawer] = useState(false);
  const current = NAV.find((n) => "href" in n && isActive(n.href, pathname));

  // close the mobile drawer on navigation and on Escape
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setDrawer(false)} />
          <aside
            aria-label="Navigation"
            className="relative flex h-full w-64 animate-slide-in flex-col border-r border-line bg-panel shadow-2xl"
          >
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-2 top-3.5 rounded p-1.5 text-muted hover:bg-bg"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur md:hidden">
          <button onClick={() => setDrawer(true)} className="-ml-1.5 rounded p-1.5 hover:bg-bg" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <Logo />
          {current && "label" in current && <span className="truncate text-sm text-muted">/ {current.label}</span>}
        </header>
        <main className="mx-auto max-w-6xl animate-fade-in px-4 py-6 md:px-8 md:py-8" key={pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-panel">
        <Gauge size={16} />
      </span>
      <span className="font-semibold tracking-tight">CostPilot</span>
    </Link>
  );
}

function Sidebar() {
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
    <>
      <div className="px-4 py-4">
        <Logo />
      </div>

      <div className="px-3 pb-2">
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
            <p key={i} className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted">
              {item.section}
            </p>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href, pathname) ? "page" : undefined}
              className={clsx(
                "relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive(item.href, pathname)
                  ? "bg-accent-soft font-medium text-accent before:absolute before:-left-2 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-accent"
                  : "text-ink/80 hover:bg-bg hover:text-ink",
              )}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ),
        )}
      </nav>

      <div className="px-3 pb-2">
        <ThemeToggle className="w-full" />
      </div>
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
        <button onClick={logout} className="rounded p-1.5 text-muted hover:bg-bg hover:text-ink" aria-label="Log out" title="Log out">
          <LogOut size={16} />
        </button>
      </div>
    </>
  );
}
