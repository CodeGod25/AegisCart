"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "aegis-theme";
type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage unavailable */
  }
  // Fall back to whatever the pre-paint script placed on <html>, then system.
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer reads the same source of truth (localStorage) as the
  // pre-paint inline script in layout.tsx, so client state matches the DOM.
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Apply before paint. Also re-applies after React's dev-mode Strict remount,
  // which resets <html> attributes and would otherwise drop the theme.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [theme]);

  // Any control can flip the theme without prop-drilling:
  //   window.dispatchEvent(new CustomEvent("aegis-theme",
  //     { detail: "dark" | "light" | "toggle" }))
  const onToggle = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as string | undefined;
    setTheme((prev) =>
      detail === "dark" || detail === "light"
        ? detail
        : prev === "dark"
          ? "light"
          : "dark"
    );
  }, []);

  useEffect(() => {
    window.addEventListener("aegis-theme", onToggle);
    return () => window.removeEventListener("aegis-theme", onToggle);
  }, [onToggle]);

  return <>{children}</>;
}
