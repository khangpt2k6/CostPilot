"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Card, CardHeader, PageHeader } from "@/components/ui";

// where apps should send traffic: the gateway itself, not this dashboard
const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

const SNIPPETS: { id: string; label: string; code: string }[] = [
  {
    id: "curl",
    label: "curl",
    code: `curl ${GATEWAY}/v1/chat/completions \\
  -H "Authorization: Bearer $COSTPILOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}' -i`,
  },
  {
    id: "ts",
    label: "TypeScript SDK",
    code: `npm install @costpilot/sdk

import { CostPilot, BudgetExceededError } from "@costpilot/sdk";

const cp = new CostPilot({ apiKey: process.env.COSTPILOT_API_KEY, baseURL: "${GATEWAY}" });

try {
  const res = await cp.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
  });
  console.log(res.choices[0].message.content);
  console.log(res.governance); // { cacheHit, budgetWarning, modelRouted, modelDowngraded }
} catch (err) {
  if (err instanceof BudgetExceededError) console.log("blocked by", err.scope);
}`,
  },
  {
    id: "openai",
    label: "OpenAI SDK",
    code: `// No new SDK needed: CostPilot speaks the OpenAI API.
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.COSTPILOT_API_KEY, baseURL: "${GATEWAY}/v1" });
const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});`,
  },
  {
    id: "python",
    label: "Python SDK",
    code: `pip install costpilot

from costpilot import CostPilot

cp = CostPilot(base_url="${GATEWAY}/v1", api_key="cp_live_...")
r = cp.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": "Hello"}])
print(r.content, r.governance.model_downgraded)`,
  },
];

export default function QuickstartPage() {
  const [tab, setTab] = useState(SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const snippet = SNIPPETS.find((s) => s.id === tab)!;

  return (
    <>
      <PageHeader title="Quickstart" sub="Three steps from zero to a governed request." />
      <ol className="space-y-4">
        <Step n={1} title="Create an API key">
          On the <Link href="/keys" className="text-accent underline">API keys</Link> page. The key decides which team the spend is billed to.
        </Step>
        <Step n={2} title="Point your app at the gateway">
          <Card className="mt-3">
            <div className="flex items-center gap-1 border-b border-line px-2 pt-2">
              {SNIPPETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setTab(s.id);
                    setCopied(false);
                  }}
                  className={`rounded-t px-3 py-1.5 text-sm ${s.id === tab ? "border-b-2 border-accent font-medium" : "text-muted hover:text-ink"}`}
                >
                  {s.label}
                </button>
              ))}
              <button
                className="ml-auto rounded p-1.5 text-muted hover:bg-bg"
                aria-label="Copy snippet"
                onClick={async () => {
                  await navigator.clipboard.writeText(snippet.code);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed">{snippet.code}</pre>
          </Card>
        </Step>
        <Step n={3} title="Add guardrails">
          Set a <Link href="/budgets" className="text-accent underline">budget</Link> so overspend is blocked with a 402 instead of billed,
          and a <Link href="/policies" className="text-accent underline">policy</Link> to keep teams on approved models. Watch the result on the{" "}
          <Link href="/" className="text-accent underline">overview</Link> and in the <Link href="/audit" className="text-accent underline">request log</Link>.
        </Step>
      </ol>
      <Card className="mt-8">
        <CardHeader title="What the response tells you" />
        <ul className="space-y-1.5 p-4 text-sm">
          <li><code className="text-xs">402</code> a budget blocked the request before it reached the model (nothing billed)</li>
          <li><code className="text-xs">403</code> a policy denied the model</li>
          <li><code className="text-xs">202</code> held for approval; an admin decides on the Approvals page</li>
          <li><code className="text-xs">X-CostPilot-Model-Downgraded</code> / <code className="text-xs">-Model-Routed</code> the model that actually ran</li>
          <li><code className="text-xs">X-CostPilot-Budget-Warning</code> under 20% of a cap left</li>
          <li><code className="text-xs">X-CostPilot-Cache: hit</code> served from the semantic cache at $0</li>
        </ul>
      </Card>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-medium">{title}</p>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}
