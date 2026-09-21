export type ThemeId = "midnight" | "ocean" | "sunset" | "forest";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Page/card backgrounds, darkest first. */
  surfaces: [string, string, string, string];
  /** Hairlines / borders. */
  line: string;
  /** Text colors. */
  ink: string;
  inkMuted: string;
  inkFaint: string;
  /** Primary accent family (300 = light tint, base, strong, soft fill). */
  accent300: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  /** Scene secondary accent (data-blue / gradients / glow). */
  glow: string;
  /** OKLCH hue of the accent — drives the 3D scene tint. */
  hue: number;
}

/**
 * The four themes. `midnight` matches the original design exactly;
 * the others recolor the same token names so the whole app themes
 * without touching any component.
 */
export const THEMES: Record<ThemeId, ThemeDef> = {
  midnight: {
    id: "midnight",
    name: "Midnight",
    tagline: "The signature violet",
    surfaces: ["#0b0f14", "#12161f", "#1a2030", "#232b3f"],
    line: "#232b3f",
    ink: "#f2f4f8",
    inkMuted: "#9aa3b2",
    inkFaint: "#5b6472",
    accent300: "#a78bfa",
    accent: "#7c5cff",
    accentStrong: "#5b8cff",
    accentSoft: "#7c5cff20",
    glow: "#5b8cff",
    hue: 262,
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    tagline: "Deep sea cyan",
    surfaces: ["#071018", "#0c1a26", "#122535", "#1a3346"],
    line: "#16293a",
    ink: "#eef6fb",
    inkMuted: "#8fa8ba",
    inkFaint: "#4e6577",
    accent300: "#67e8f9",
    accent: "#06b6d4",
    accentStrong: "#0ea5e9",
    accentSoft: "#06b6d420",
    glow: "#38bdf8",
    hue: 200,
  },
  sunset: {
    id: "sunset",
    name: "Sunset",
    tagline: "Ember orange",
    surfaces: ["#120b0e", "#1c1116", "#26181e", "#33212a"],
    line: "#33212a",
    ink: "#faf3f1",
    inkMuted: "#b8a3a8",
    inkFaint: "#6e5a60",
    accent300: "#fdba74",
    accent: "#f97316",
    accentStrong: "#fb923c",
    accentSoft: "#f9731620",
    glow: "#fb7185",
    hue: 30,
  },
  forest: {
    id: "forest",
    name: "Forest",
    tagline: "Alpine emerald",
    surfaces: ["#0a120e", "#101c15", "#16281e", "#1f3629"],
    line: "#1f3629",
    ink: "#f0f7f2",
    inkMuted: "#9ab3a4",
    inkFaint: "#54685c",
    accent300: "#6ee7b7",
    accent: "#10b981",
    accentStrong: "#34d399",
    accentSoft: "#10b98120",
    glow: "#2dd4bf",
    hue: 160,
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

const STORAGE_KEY = "gymai-theme";

export function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t && t in THEMES ? (t as ThemeId) : "midnight";
  } catch {
    return "midnight";
  }
}

export function saveTheme(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode — session-only */
  }
}

/** Inline CSS variable assignments applied to <html> for a theme. */
export function themeStyle(id: ThemeId): Record<string, string> {
  const t = THEMES[id] ?? THEMES.midnight;
  return {
    "--color-surface-0": t.surfaces[0],
    "--color-surface-1": t.surfaces[1],
    "--color-surface-2": t.surfaces[2],
    "--color-surface-3": t.surfaces[3],
    "--color-line": t.line,
    "--color-ink": t.ink,
    "--color-ink-muted": t.inkMuted,
    "--color-ink-faint": t.inkFaint,
    "--color-accent-300": t.accent300,
    "--color-accent": t.accent,
    "--color-accent-strong": t.accentStrong,
    "--color-accent-soft": t.accentSoft,
    "--color-data-blue": t.glow,
    "--scene-hue": String(t.hue),
  };
}
