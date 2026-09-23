import { THEMES, type ThemeId } from "../lib/themes";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

/** Compact theme switcher — a row of color dots, one per theme. */
export default function ThemeDots({ className }: { className?: string }) {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className={cn("flex flex-col items-end gap-1", className)} role="group" aria-label="App theme">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Theme</span>
      <div className="flex items-center gap-1.5">
      {themes.map((id: ThemeId) => {
        const t = THEMES[id];
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            title={t.name}
            aria-label={`${t.name} theme`}
            aria-pressed={active}
            onClick={() => setTheme(id)}
            className={cn(
              "h-6 w-6 cursor-pointer rounded-full border border-line transition-all",
              active
                ? "scale-110 border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]"
                : "opacity-70 hover:scale-105 hover:opacity-100"
            )}
            style={{ background: `linear-gradient(135deg, ${t.surfaces[1]} 50%, ${t.accent} 50%)` }}
          />
        );
      })}
      </div>
    </div>
  );
}
