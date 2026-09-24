"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

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
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Loading...</div>;
  }
  if (me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-danger">
        Can&apos;t reach the gateway: {me.error.message}
      </div>
    );
  }
  return (
    <SessionProvider me={me.data}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
