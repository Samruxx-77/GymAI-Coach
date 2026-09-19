import { cn } from "../lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent shadow-[0_0_24px_-6px_var(--color-accent)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5v11M17.5 6.5v11" />
          <path d="M3.5 9v6M20.5 9v6" />
          <path d="M6.5 12h11" />
        </svg>
      </div>
      {!compact && (
        <span className="display text-lg font-bold tracking-tight text-ink">
          GymAI<span className="text-accent-300">Coach</span>
        </span>
      )}
    </div>
  );
}
