import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "../components/Icons";

const THEME_KEY = "wivae.theme";

/**
 * Ported from Home.tsx's useMarketingTheme. Defaults to LIGHT unconditionally
 * (not system preference) — a persuasion-first landing page and a data-dense
 * admin tool have different defaults for good reason. Shares the same
 * localStorage key as the dashboard, so a choice made here carries over
 * after signing in.
 *
 * The actual dark class is applied pre-paint by the inline script in
 * Layout.astro (avoids a flash) — this island's job is just to keep that in
 * sync once JS loads and to persist toggles back to localStorage.
 */
export default function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(THEME_KEY) === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      aria-label="Toggle theme"
      title="Toggle theme"
      className="rounded-full p-2 text-muted hover:bg-surface"
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
