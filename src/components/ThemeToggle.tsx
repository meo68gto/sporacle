"use client";

import { useEffect, useState } from "react";

/**
 * Appearance switch (design: sidebar footer segmented control). Light / Dark
 * / System. The choice is persisted to localStorage and applied by setting
 * `data-theme` on <html>; "system" clears the attribute and follows the OS
 * via prefers-color-scheme (globals.css). A pre-paint boot script in the
 * root layout applies the stored choice, so this only reconciles state and
 * handles clicks — there is no server dependency and no flash.
 */

type Theme = "light" | "dark" | "system";
const KEY = "sporacle-theme";
const OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  // Start at "system" so server and first client render agree (avoids a
  // hydration mismatch); the stored value is read in an effect.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* storage may be unavailable — fall back to system */
    }
    setTheme(stored);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* non-fatal — the choice just will not persist */
    }
  }

  return (
    <div className="appearance">
      <div className="appearance-label">Appearance</div>
      <div className="seg-theme" role="group" aria-label="Appearance">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`seg-theme-opt${theme === opt.id ? " selected" : ""}`}
            aria-pressed={theme === opt.id}
            onClick={() => choose(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
