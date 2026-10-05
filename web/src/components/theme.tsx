"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "costpilot-theme";

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the choice just won't survive a reload
  }
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  // "system" until mounted so server and client markup agree
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(read()), []);

  return (
    <div role="group" aria-label="Theme" className={clsx("inline-flex rounded-md border border-line bg-bg p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={`${o.label} theme`}
          aria-pressed={theme === o.value}
          onClick={() => {
            setTheme(o.value);
            apply(o.value);
          }}
          className={clsx(
            "flex h-6 flex-1 items-center justify-center rounded px-2 transition-colors",
            theme === o.value ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          <o.icon size={14} />
        </button>
      ))}
    </div>
  );
}
