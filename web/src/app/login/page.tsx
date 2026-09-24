"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";

import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { api, primeCsrf } from "@/lib/api";
import type { Providers } from "@/lib/types";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const next = safeNext(params.get("next"));
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Providers>("/auth/providers", { workspace: false }),
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function devLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await primeCsrf();
      await api("/auth/dev-login", { method: "POST", body: { email }, workspace: false });
      await client.invalidateQueries({ queryKey: ["me"] });
      router.replace(next);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const p = providers.data;
  const nothing = p && !p.github && !p.google && !p.devLogin;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Gauge className="text-accent" />
          <span className="text-lg font-semibold tracking-tight">CostPilot</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Budgets, policies and approvals for every LLM call your team makes.</p>

        {params.get("error") !== null && <p className="mt-4 text-sm text-danger">Sign-in failed. Try again.</p>}

        <div className="mt-6 space-y-2">
          {p?.github && (
            <a href="/oauth2/authorization/github" className="block">
              <Button className="w-full">Continue with GitHub</Button>
            </a>
          )}
          {p?.google && (
            <a href="/oauth2/authorization/google" className="block">
              <Button className="w-full">Continue with Google</Button>
            </a>
          )}
        </div>

        {p?.devLogin && (
          <form onSubmit={devLogin} className="mt-6 space-y-3 border-t border-line pt-6">
            <Field label="Email" hint="Local dev login: no password. Disabled on real deployments.">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </Field>
            <ErrorNote error={error} />
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        )}

        {nothing && (
          <p className="mt-6 text-sm text-muted">
            No sign-in method is configured. Set GitHub/Google OAuth credentials on the gateway, or enable
            COSTPILOT_AUTH_DEV_LOGIN_ENABLED for local use.
          </p>
        )}
        <ErrorNote error={providers.error} />
      </div>
    </div>
  );
}

// only same-site relative paths, never an open redirect
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
