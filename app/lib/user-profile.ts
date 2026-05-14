"use client";

/**
 * User profile — context that Claude sees on every AI call.
 * Stored in localStorage. Per-browser for now (sync via Supabase can be added later).
 */

const KEY = "vague:profile:v1";

export type UserProfile = {
  /** Free-form bio: who is the user, what they do, key facts about their business. */
  bio: string;
  /** Work hours (used to clamp planning windows). */
  workStart: string; // "HH:MM"
  workEnd: string;
  /** Soft preferences: what they like / dislike doing when. */
  preferences: string;
  /** Patterns / habits observed or stated. */
  patterns: string;
};

const DEFAULT_PROFILE: UserProfile = {
  bio: "",
  workStart: "08:00",
  workEnd: "19:00",
  preferences: "",
  patterns: "",
};

export function loadProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: UserProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function hasProfile(): boolean {
  const p = loadProfile();
  return !!(p.bio.trim() || p.preferences.trim() || p.patterns.trim());
}

/**
 * Build a system-prompt block summarizing the profile.
 * Returns null if the profile is empty (no point including it).
 */
export function profileToSystemBlock(p: UserProfile): string | null {
  const parts: string[] = [];
  if (p.bio.trim()) {
    parts.push(`PROFIL DE L'UTILISATEUR :\n${p.bio.trim()}`);
  }
  parts.push(`Plages de travail : ${p.workStart} – ${p.workEnd}`);
  if (p.preferences.trim()) {
    parts.push(`Préférences / contraintes :\n${p.preferences.trim()}`);
  }
  if (p.patterns.trim()) {
    parts.push(`Habitudes / routines :\n${p.patterns.trim()}`);
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}
