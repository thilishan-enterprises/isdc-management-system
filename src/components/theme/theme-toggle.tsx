"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

function subscribeToHydration() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  const { resolvedTheme, setTheme } = useTheme();
  const isDark = mounted && resolvedTheme === "dark";

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      aria-label={
        !mounted
          ? "Loading theme preference"
          : isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
      }
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-wait disabled:opacity-70"
    >
      {isDark ? (
        <Sun className="size-[18px]" aria-hidden="true" />
      ) : (
        <Moon className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
