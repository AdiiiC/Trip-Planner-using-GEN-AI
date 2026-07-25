"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const active = theme ?? resolvedTheme;
  const isDark = active !== "light";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      data-testid="theme-toggle"
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <Sun
        className={cn(
          "h-3.5 w-3.5 transition-all",
          isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0 absolute"
        )}
        strokeWidth={1.75}
      />
      <Moon
        className={cn(
          "h-3.5 w-3.5 transition-all",
          isDark ? "rotate-90 scale-0 absolute" : "rotate-0 scale-100"
        )}
        strokeWidth={1.75}
      />
    </button>
  );
}
