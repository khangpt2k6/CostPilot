"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Gauge, ShieldCheck, Wallet } from "lucide-react";

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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-10 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-panel">
              <Gauge size={18} />
            </span>
            <span className="text-lg font-semibold tracking-tight">CostPilot</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Budgets, policies and approvals for every LLM call your team makes.</p>

          {params.get("error") !== null && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Sign-in failed. Try again.</p>
          )}

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

      <aside className="hidden border-l border-line bg-accent-soft lg:flex lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md">
          <p className="text-sm font-medium text-accent">LLM spend governance</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
            Every model call checked against a budget before it costs you.
          </h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel text-accent shadow-card">
                  <f.icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

const FEATURES = [
  { icon: Wallet, title: "Hard budgets", text: "Caps per team and project. Runaway spend gets blocked, not billed." },
  { icon: ShieldCheck, title: "Model policies", text: "Allow lists, automatic downgrades and routing to cheaper models." },
  { icon: BadgeCheck, title: "Approvals", text: "Expensive requests wait for a human before they run." },
];

// only same-site relative paths, never an open redirect
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
