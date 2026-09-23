import { cn } from "../lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-[0_0_24px_-6px_var(--color-accent)]">
        <img src="/gymai-logo.png" alt="GymAI Coach logo" className="h-full w-full object-cover" />
      </div>
      {!compact && (
        <span className="display text-lg font-bold tracking-tight text-ink">
          GymAI<span className="text-accent-300">Coach</span>
        </span>
      )}
    </div>
  );
}
