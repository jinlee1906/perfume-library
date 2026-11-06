// Light/dark switch in the header.
// Until you click it, the site follows your system setting. Once you pick a mode,
// it's remembered in this browser (localStorage). index.html applies the saved
// choice before the page draws, so there's no flash of the wrong colours.

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";
const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null; // storage blocked (e.g. private window): just follow the system
  }
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<Theme | null>(savedTheme);
  const [systemDark, setSystemDark] = useState(systemQuery.matches);

  // Notice when the system switches between light and dark.
  useEffect(() => {
    const onChange = () => setSystemDark(systemQuery.matches);
    systemQuery.addEventListener("change", onChange);
    return () => systemQuery.removeEventListener("change", onChange);
  }, []);

  // <html data-theme="..."> tells the CSS which mode to use.
  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
  }, [choice]);

  const current: Theme = choice ?? (systemDark ? "dark" : "light");
  const next: Theme = current === "dark" ? "light" : "dark";

  const toggle = () => {
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // can't remember it; it still applies until the page is closed
    }
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      {next === "dark" ? "☾ Dark" : "☀︎ Light"}
    </button>
  );
}
