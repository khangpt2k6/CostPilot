// Thin client for the gateway's console API. Same-origin (see next.config.ts rewrites):
// the session cookie rides along automatically, writes echo the XSRF-TOKEN cookie back as
// X-XSRF-TOKEN, and every call names the active workspace in X-Workspace-ID.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

const WORKSPACE_KEY = "costpilot.workspace";

export function getWorkspaceId(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function setWorkspaceId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(WORKSPACE_KEY, id);
    else window.localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // private mode: the header falls back to the first workspace server-side
  }
}

function xsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

type Options = { method?: string; body?: unknown; workspace?: boolean };

export async function api<T>(path: string, { method = "GET", body, workspace = true }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const token = xsrfToken();
    if (token) headers["X-XSRF-TOKEN"] = token;
  }
  const ws = workspace ? getWorkspaceId() : null;
  if (ws) headers["X-Workspace-ID"] = ws;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data) ?? `${res.status} ${res.statusText}`, data);
  }
  return data as T;
}

/** The first GET plants the XSRF-TOKEN cookie; call before the first write on a fresh page. */
export async function primeCsrf() {
  if (!xsrfToken()) await fetch("/auth/providers", { credentials: "same-origin" });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const d = data as { error?: { message?: string } | string; message?: string };
    if (typeof d.error === "object" && d.error?.message) return d.error.message;
    if (typeof d.message === "string") return d.message;
    if (typeof d.error === "string") return d.error;
  }
  return undefined;
}
