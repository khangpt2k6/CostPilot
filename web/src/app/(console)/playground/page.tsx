"use client";

import { useState, type FormEvent } from "react";

import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";

const MODELS = ["gpt-4o-mini", "gpt-4o", "claude-haiku-4-5", "claude-sonnet-4-5", "gemini-2.5-flash", "gemini-2.5-pro"];

interface Result {
  status: number;
  ms: number;
  headers: [string, string][];
  body: string;
}

// Sends a real request through the gateway with an API key, exactly as an app would. The key
// stays in this tab's memory only. The call carries a bearer key, so the gateway handles it on
// the stateless API-key chain, not with the dashboard session.
export default function PlaygroundPage() {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [team, setTeam] = useState("");
  const [prompt, setPrompt] = useState("Explain LLM cost governance in one sentence.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const started = performance.now();
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" };
      if (team.trim()) headers["X-Team-ID"] = team.trim();
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 256 }),
      });
      const text = await res.text();
      const governance = [...res.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-costpilot"));
      setResult({ status: res.status, ms: Math.round(performance.now() - started), headers: governance, body: pretty(text) });
    } catch (err) {
      setResult({ status: 0, ms: 0, headers: [], body: String(err) });
    } finally {
      setBusy(false);
    }
  }

  const answer = result && result.status === 200 ? extractAnswer(result.body) : null;

  return (
    <>
      <PageHeader title="Playground" sub="Send one request through the gateway and see what governance did to it." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Request" />
          <form onSubmit={send} className="space-y-4 p-4">
            <Field label="API key" hint="Kept in this tab only. Create one on the API keys page.">
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="cp_live_..." required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model">
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="X-Team-ID (admin keys)">
                <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="optional" />
              </Field>
            </div>
            <Field label="Message">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Sending..." : "Send"}
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader
            title="Response"
            action={
              result && (
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Badge tone={result.status === 200 ? "good" : result.status === 202 ? "warn" : "bad"}>{result.status || "error"}</Badge>
                  {result.ms} ms
                </span>
              )
            }
          />
          <div className="space-y-4 p-4">
            {!result && <p className="text-sm text-muted">Nothing sent yet.</p>}
            {result && (
              <>
                <p className="text-sm">{meaning(result.status)}</p>
                {answer && <p className="rounded-md bg-bg p-3 text-sm">{answer}</p>}
                {result.headers.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {result.headers.map(([k, v]) => (
                      <li key={k}>
                        <code>{k}</code>: <span className="text-muted">{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="max-h-80 overflow-auto rounded-md border border-line p-3 text-xs">{result.body}</pre>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function meaning(status: number): string {
  switch (status) {
    case 200:
      return "Served.";
    case 202:
      return "Held for approval. An admin can approve it on the Approvals page.";
    case 401:
      return "The key is missing, wrong or revoked.";
    case 402:
      return "Blocked by a budget before it reached the model. Nothing was billed.";
    case 403:
      return "Denied by a policy.";
    default:
      return status === 0 ? "Could not reach the gateway." : "Unexpected response.";
  }
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function extractAnswer(body: string): string | null {
  try {
    return JSON.parse(body).choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
