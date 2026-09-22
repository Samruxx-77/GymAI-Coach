import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** YYYY-MM-DD key for a Date (local time, not UTC). */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** YYYY-MM-DD for yesterday, in LOCAL time (not UTC). */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatKg(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${formatNumber(n, Number.isInteger(n) ? 0 : 1)} kg`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Percentage of goal progress (0–100) between start → current → target. */
export function goalProgressPercent(
  start: number | null,
  current: number | null,
  target: number | null
): number {
  if (start == null || current == null || target == null) return 0;
  const total = target - start;
  if (Math.abs(total) < 0.05) return current <= target + 0.05 ? 100 : 0;
  const done = ((current - start) / total) * 100;
  return clamp(Math.round(done), 0, 100);
}

/**
 * Is a 4-week weight delta good news for the given goal?
 * "good" — build_muscle gaining / lose_weight losing / others staying stable,
 * "bad" — moving against the goal, "neutral" — too small to matter.
 */
export function trendTone(
  deltaKg: number,
  goal: string | null | undefined
): "good" | "bad" | "neutral" {
  if (Math.abs(deltaKg) < 0.25) return "neutral";
  if (goal === "build_muscle") return deltaKg > 0 ? "good" : "bad";
  if (goal === "lose_weight") return deltaKg < 0 ? "good" : "bad";
  // recomp / endurance / general health: stability is the win.
  return Math.abs(deltaKg) <= 1 ? "good" : "bad";
}
