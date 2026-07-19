import { useCallback, useEffect, useState } from "react";

const KEY = "wivae.theme";

function initial(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(KEY);
  if (stored) return stored === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Applies/removes `.dark` on <html> (app.css re-themes every token-based utility off it) and persists the choice. */
export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return [dark, toggle];
}
