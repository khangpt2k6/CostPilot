"use client";

import clsx from "clsx";
import { X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        variant === "primary" && "bg-accent text-panel shadow-card hover:opacity-90 active:opacity-80",
        variant === "secondary" && "border border-line bg-panel hover:bg-bg",
        variant === "ghost" && "hover:bg-bg",
        variant === "danger" && "border border-line bg-panel text-danger hover:bg-danger-soft",
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-9 rounded-md border border-line bg-panel px-3 text-sm placeholder:text-muted",
        fullUnlessSized(className),
        "focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "h-9 rounded-md border border-line bg-panel px-2 text-sm focus:outline-2 focus:outline-accent",
        fullUnlessSized(className),
        className,
      )}
    >
      {children}
    </select>
  );
}

// full width by default; a caller-supplied w-* wins (class order doesn't decide CSS precedence)
function fullUnlessSized(className?: string) {
  return /(^|\s)(max-)?w-/.test(className ?? "") ? undefined : "w-full";
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx("rounded-lg border border-line bg-panel shadow-card", className)}>{children}</section>;
}

export function CardHeader({ title, action, sub }: { title: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-bg text-muted",
        tone === "good" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-danger-soft text-danger",
      )}
    >
      {children}
    </span>
  );
}

export function Table({ head, loading, children }: { head: ReactNode[]; loading?: boolean; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loading
            ? Array.from({ length: 4 }, (_, r) => (
                <tr key={r} aria-hidden>
                  {head.map((_, c) => (
                    <td key={c} className="px-4 py-3">
                      <Skeleton className={c === 0 ? "w-28" : "w-16"} />
                    </td>
                  ))}
                </tr>
              ))
            : children}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ className, children }: { className?: string; children: ReactNode }) {
  return <td className={clsx("px-4 py-2.5 align-middle", className)}>{children}</td>;
}

export function Empty({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      {Icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={18} />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>;
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus the first field, else the dialog itself, so keyboard users land inside it
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea");
    (first ?? panel.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-md animate-pop-in overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-bg hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon size={15} />
          </span>
        )}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-24" />
          <Skeleton className="mt-2 w-32" />
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </>
      )}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("block h-3 animate-shimmer rounded bg-line", className)} />;
}

export function AdminOnly({ canAdmin, children }: { canAdmin: boolean; children: ReactNode }) {
  return canAdmin ? <>{children}</> : null;
}
