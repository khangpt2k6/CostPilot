"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Gauge, TriangleAlert } from "lucide-react";

import { Shell } from "@/components/shell";
import { ApiError } from "@/lib/api";
import { SessionProvider, useMeQuery } from "@/lib/session";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMeQuery();

  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, pathname, router]);

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-muted" aria-busy>
        <span className="flex h-10 w-10 animate-shimmer items-center justify-center rounded-lg bg-accent text-panel">
          <Gauge size={20} />
        </span>
        Loading your workspace...
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-lg border border-line bg-panel p-6 text-center shadow-card">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert size={18} />
          </span>
          <p className="text-sm font-medium">Can&apos;t reach the gateway</p>
          <p className="mt-1 text-sm text-muted">{me.error.message}</p>
          <button
            onClick={() => me.refetch()}
            className="mt-4 h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-bg"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  return (
    <SessionProvider me={me.data}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
