import { cn } from "../lib/utils";

export interface AvatarDef {
  id: string;
  name: string;
  /** Linear-gradient stops (top-left → bottom-right). Kept opaque on purpose: */
  /* translucent avatar fills let the banner's spotlight art bleed through. */
  bg: [string, string];
  /** Accent glow color (used for the picker ring + subtle inner highlight). */
  glow: string;
}

/** The 8 selectable avatar variants — flat duotone gradients, GPU-safe. */
export const AVATARS: AvatarDef[] = [
  { id: "aurora", name: "Aurora", bg: ["#4c3d8f", "#221a47"], glow: "#7c5cff" },
  { id: "tide", name: "Tide", bg: ["#155a6b", "#0a2933"], glow: "#22d3ee" },
  { id: "ember", name: "Ember", bg: ["#7a4220", "#33190c"], glow: "#f97316" },
  { id: "grove", name: "Grove", bg: ["#19654a", "#0b2b1e"], glow: "#10b981" },
  { id: "rose", name: "Rose", bg: ["#7a2148", "#33101f"], glow: "#fb7185" },
  { id: "sky", name: "Sky", bg: ["#1f4c85", "#0c2038"], glow: "#5b8cff" },
  { id: "gold", name: "Gold", bg: ["#776f1e", "#2c290a"], glow: "#fbbf24" },
  { id: "steel", name: "Steel", bg: ["#4a4a56", "#1c1c22"], glow: "#c7d2fe" },
];

export function avatarById(id: string | null | undefined): AvatarDef | null {
  // Stored format is `avatar:<id>` (see the picker in ProfileSettings); strip
  // the prefix so a chosen variant actually resolves. Anything else (null,
  // remote URLs) falls back to the initials chip.
  const bare = (id ?? "").replace(/^avatar:/, "");
  return AVATARS.find((a) => a.id === bare) ?? null;
}

interface AvatarProps {
  avatarId?: string | null;
  /** Member's display name — first letter is shown when no variant is set. */
  name?: string | null;
  className?: string;
  /** Accepted for API compat; variants are flat gradients (no decorative mark). */
  showMark?: boolean;
}

/**
 * Identity chip. Pure CSS (no SVG): opaque gradient fill, flex-centered
 * initial with leading-none — renders identically at every size/viewport
 * and can never leak background art through translucent fills.
 */
export function Avatar({ avatarId, name, className }: AvatarProps) {
  const def = avatarById(avatarId);
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "G";

  const background = def
    ? `linear-gradient(135deg, ${def.bg[0]} 0%, ${def.bg[1]} 100%)`
    : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)";

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-xl leading-none",
        className
      )}
      style={{ background }}
    >
      <span
        className="display font-bold leading-none text-white"
        style={{
          fontSize: "0.55em",
          textShadow: "0 1px 6px rgba(0,0,0,0.35)",
        }}
      >
        {initial}
      </span>
    </div>
  );
}
