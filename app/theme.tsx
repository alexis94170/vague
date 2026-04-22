"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ThemePalette = "indigo" | "ocean" | "forest" | "sunset" | "mono";

const STORAGE_KEY = "vague:theme";

type Prefs = { mode: ThemeMode; palette: ThemePalette };

type Ctx = {
  mode: ThemeMode;
  palette: ThemePalette;
  resolvedMode: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  setPalette: (p: ThemePalette) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

const PALETTES: Record<ThemePalette, { accent: string; accentHover: string; accentSoft: string; accentSoft2: string; accentShadow: string }> = {
  indigo:  { accent: "#6366f1", accentHover: "#4f46e5", accentSoft: "#eef2ff", accentSoft2: "#e0e7ff", accentShadow: "99, 102, 241" },
  ocean:   { accent: "#0ea5e9", accentHover: "#0284c7", accentSoft: "#e0f2fe", accentSoft2: "#bae6fd", accentShadow: "14, 165, 233" },
  forest:  { accent: "#10b981", accentHover: "#059669", accentSoft: "#d1fae5", accentSoft2: "#a7f3d0", accentShadow: "16, 185, 129" },
  sunset:  { accent: "#f97316", accentHover: "#ea580c", accentSoft: "#ffedd5", accentSoft2: "#fed7aa", accentShadow: "249, 115, 22" },
  mono:    { accent: "#52525b", accentHover: "#3f3f46", accentSoft: "#f4f4f5", accentSoft2: "#e4e4e7", accentShadow: "82, 82, 91" },
};

const PALETTES_DARK: Record<ThemePalette, { accent: string; accentHover: string; accentSoft: string; accentSoft2: string; accentShadow: string }> = {
  indigo:  { accent: "#a5b4fc", accentHover: "#c7d2fe", accentSoft: "rgba(129, 140, 248, 0.14)", accentSoft2: "rgba(129, 140, 248, 0.22)", accentShadow: "129, 140, 248" },
  ocean:   { accent: "#7dd3fc", accentHover: "#bae6fd", accentSoft: "rgba(56, 189, 248, 0.14)", accentSoft2: "rgba(56, 189, 248, 0.22)", accentShadow: "56, 189, 248" },
  forest:  { accent: "#6ee7b7", accentHover: "#a7f3d0", accentSoft: "rgba(52, 211, 153, 0.14)", accentSoft2: "rgba(52, 211, 153, 0.22)", accentShadow: "52, 211, 153" },
  sunset:  { accent: "#fdba74", accentHover: "#fed7aa", accentSoft: "rgba(251, 146, 60, 0.14)", accentSoft2: "rgba(251, 146, 60, 0.22)", accentShadow: "251, 146, 60" },
  mono:    { accent: "#a1a1aa", accentHover: "#d4d4d8", accentSoft: "rgba(161, 161, 170, 0.14)", accentSoft2: "rgba(161, 161, 170, 0.22)", accentShadow: "161, 161, 170" },
};

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { mode: "system", palette: "indigo" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.mode && p.palette) return p;
    }
  } catch {}
  return { mode: "system", palette: "indigo" };
}

function savePrefs(p: Prefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function applyTheme(prefs: Prefs, systemDark: boolean) {
  const root = document.documentElement;
  const isDark = prefs.mode === "dark" || (prefs.mode === "system" && systemDark);
  root.classList.toggle("theme-dark", isDark);
  root.classList.toggle("theme-light", !isDark);
  root.setAttribute("data-palette", prefs.palette);
  const p = isDark ? PALETTES_DARK[prefs.palette] : PALETTES[prefs.palette];
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--accent-hover", p.accentHover);
  root.style.setProperty("--accent-soft", p.accentSoft);
  root.style.setProperty("--accent-soft-2", p.accentSoft2);
  root.style.setProperty("--shadow-accent", `0 8px 24px rgba(${p.accentShadow}, 0.3)`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({ mode: "system", palette: "indigo" });
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(prefs, systemDark);
  }, [prefs, systemDark]);

  function setMode(mode: ThemeMode) {
    const next = { ...prefs, mode };
    setPrefs(next);
    savePrefs(next);
  }
  function setPalette(palette: ThemePalette) {
    const next = { ...prefs, palette };
    setPrefs(next);
    savePrefs(next);
  }

  const resolvedMode: "light" | "dark" = prefs.mode === "system" ? (systemDark ? "dark" : "light") : prefs.mode;

  return (
    <ThemeContext.Provider value={{ mode: prefs.mode, palette: prefs.palette, resolvedMode, setMode, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used in ThemeProvider");
  return ctx;
}

export const PALETTE_INFO: Record<ThemePalette, { name: string; color: string }> = {
  indigo: { name: "Indigo", color: "#6366f1" },
  ocean: { name: "Océan", color: "#0ea5e9" },
  forest: { name: "Forêt", color: "#10b981" },
  sunset: { name: "Sunset", color: "#f97316" },
  mono: { name: "Mono", color: "#52525b" },
};
