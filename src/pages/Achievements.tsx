import { Award, Crown, Flame, Lock, Medal, Scale, Star, Target, Trophy, Utensils, Zap } from "lucide-react";
import { Card, Badge, ProgressBar } from "../components/ui";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { rankForXp } from "../lib/gamification";
import { cn, formatNumber } from "../lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  award: Award, crown: Crown, flame: Flame, medal: Medal, scale: Scale,
  star: Star, target: Target, trophy: Trophy, utensils: Utensils, zap: Zap,
  dumbbell: Award, scan: Award, sparkles: Award, "calendar-check": Award, beef: Award,
};

const TIER_STYLES: Record<string, string> = {
  bronze: "border-data-amber/30 bg-data-amber/5",
  silver: "border-slate-400/30 bg-slate-400/5",
  gold: "border-data-amber/50 bg-data-amber/10",
  platinum: "border-data-teal/40 bg-data-teal/10",
  mythical: "border-accent/50 bg-accent-soft",
  immortal: "border-danger/40 bg-danger/10",
};

export default function Achievements() {
  const { achievements, userAchievements, sessions, foodEntries, weightEntries } = useData();
  const { profile } = useProfile();

  const rank = rankForXp(profile?.xp ?? 0);
  const unlockedIds = new Set(userAchievements.map((ua) => ua.achievement_id));
  const unlocked = achievements.filter((a) => unlockedIds.has(a.id));

  const loggingDays = new Set(foodEntries.map((f) => f.entry_date)).size;

  return (
    <div className="page-fade space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Achievements</h1>
        <p className="text-[13px] text-ink-muted">Earned by real actions — never bought, never given.</p>
      </div>

      {/* rank card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ink-faint">Current rank</p>
            <p className="display text-2xl font-bold text-ink">{rank.current.name}</p>
          </div>
          <div className="text-right">
            <p className="display text-2xl font-bold tnum text-ink">{formatNumber(profile?.xp ?? 0)}</p>
            <p className="text-[12px] text-ink-muted">total XP</p>
          </div>
        </div>
        <ProgressBar className="mt-4" value={rank.progress} />
        <p className="mt-2 text-[13px] text-ink-muted">
          {rank.next
            ? `${formatNumber(rank.next.minXp - (profile?.xp ?? 0))} XP to ${rank.next.name}`
            : "Maximum rank reached"}
        </p>
      </Card>

      {/* stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Workouts", sessions.length],
          ["Meals logged", foodEntries.length],
          ["Weigh-ins", weightEntries.length],
          ["Logging days", loggingDays],
        ].map(([label, value]) => (
          <Card key={label as string} className="py-4 text-center">
            <p className="display text-lg font-bold tnum">{formatNumber(value as number)}</p>
            <p className="text-[12px] text-ink-muted">{label}</p>
          </Card>
        ))}
      </div>

      {/* grid */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Badges</h2>
          <span className="text-[13px] text-ink-muted">{unlocked.length}/{achievements.length} unlocked</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {achievements.map((a) => {
            const isUnlocked = unlockedIds.has(a.id);
            const Icon = ICONS[a.icon] ?? Award;
            return (
              <div
                key={a.id}
                className={cn(
                  "card flex flex-col items-center gap-2 p-4 text-center",
                  isUnlocked ? TIER_STYLES[a.tier] : "opacity-50"
                )}
              >
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  isUnlocked ? "bg-surface-2 text-accent-300" : "bg-surface-1 text-ink-faint"
                )}>
                  {isUnlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>
                <p className="text-[14px] font-semibold text-ink">{a.name}</p>
                <p className="text-[12px] leading-snug text-ink-muted">{a.description}</p>
                {isUnlocked ? (
                  <Badge tone="accent">+{a.xp_reward} XP</Badge>
                ) : (
                  <Badge>{a.tier}</Badge>
                )}
              </div>
            );
          })}
        </div>
        {achievements.length === 0 && (
          <p className="mt-3 text-[13px] text-ink-faint">Run supabase/schema.sql to seed achievements.</p>
        )}
      </div>
    </div>
  );
}
