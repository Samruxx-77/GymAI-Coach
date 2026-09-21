import { useId } from "react";
import { cn } from "../lib/utils";

export interface AvatarDef {
  id: string;
  name: string;
  /** Inner + outer radial gradient stops. */
  bg: [string, string];
  /** Corner glow color. */
  glow: string;
}

/** The 8 selectable avatar variants. */
export const AVATARS: AvatarDef[] = [
  { id: "aurora", name: "Aurora", bg: ["#3b2f66", "#171130"], glow: "#7c5cff" },
  { id: "tide", name: "Tide", bg: ["#0e3a46", "#071a21"], glow: "#22d3ee" },
  { id: "ember", name: "Ember", bg: ["#4d2a12", "#211107"], glow: "#f97316" },
  { id: "grove", name: "Grove", bg: ["#0f3b2b", "#06180f"], glow: "#10b981" },
  { id: "rose", name: "Rose", bg: ["#4a1230", "#1e0813"], glow: "#fb7185" },
  { id: "sky", name: "Sky", bg: ["#123055", "#071425"], glow: "#5b8cff" },
  { id: "gold", name: "Gold", bg: ["#3f3d10", "#191804"], glow: "#fbbf24" },
  { id: "steel", name: "Steel", bg: ["#2d2d34", "#111114"], glow: "#c7d2fe" },
];

export function avatarById(id: string | null | undefined): AvatarDef | null {
  return AVATARS.find((a) => a.id === id) ?? null;
}

/** Dumbbell mark drawn in the lower-right of the avatar. */
const MARK = (
  <g transform="translate(126 122) scale(1.05)" opacity=".92">
    <rect x="0" y="10" width="40" height="6" rx="3" fill="#fff" fillOpacity=".9" />
    <rect x="-6" y="0" width="9" height="26" rx="4" fill="#fff" fillOpacity=".9" />
    <rect x="43" y="0" width="9" height="26" rx="4" fill="#fff" fillOpacity=".9" />
    <rect x="-12" y="4" width="5" height="18" rx="2.5" fill="#fff" fillOpacity=".55" />
    <rect x="52" y="4" width="5" height="18" rx="2.5" fill="#fff" fillOpacity=".55" />
  </g>
);

interface AvatarProps {
  avatarId?: string | null;
  /** Member's display name — first letter is overlaid when no variant is set. */
  name?: string | null;
  className?: string;
  /** Decorative initials from the variant itself (picker preview). */
  showMark?: boolean;
}

export function Avatar({ avatarId, name, className, showMark = true }: AvatarProps) {
  const uid = useId().replace(/[:]/g, "");
  const def = avatarById(avatarId);
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "G";

  if (!def) {
    // No variant chosen: solid initials chip sized by the parent via `em`.
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft text-accent-300",
          className
        )}
        aria-hidden
      >
        <span className="display font-bold" style={{ fontSize: "0.55em" }}>
          {initial}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-xl", className)} aria-hidden>
      <svg viewBox="0 0 192 192" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={`bg-${uid}`} cx=".3" cy=".2" r=".9">
            <stop offset="0" stopColor={def.bg[0]} />
            <stop offset="1" stopColor={def.bg[1]} />
          </radialGradient>
          <radialGradient id={`glow-${uid}`} cx=".78" cy=".82" r=".6">
            <stop offset="0" stopColor={def.glow} stopOpacity=".5" />
            <stop offset="1" stopColor={def.glow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="192" height="192" fill={`url(#bg-${uid})`} />
        <rect width="192" height="192" fill={`url(#glow-${uid})`} />
        {showMark && MARK}
      </svg>
      <span className="display absolute inset-0 flex items-center justify-center font-bold text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]" style={{ fontSize: "0.6em" }}>
        {initial}
      </span>
    </div>
  );
}
