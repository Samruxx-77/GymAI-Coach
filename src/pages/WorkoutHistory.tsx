import { Link } from "react-router-dom";
import { CalendarClock, Dumbbell, Timer } from "lucide-react";
import { Card, Badge, EmptyState, Button } from "../components/ui";
import { useData } from "../context/DataContext";
import { formatNumber } from "../lib/utils";

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function WorkoutHistory() {
  const { sessions, loading } = useData();

  const totals = sessions.reduce(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      minutes: acc.minutes + (s.duration_minutes ?? 0),
      volume: acc.volume + s.total_volume_kg,
    }),
    { sessions: 0, minutes: 0, volume: 0 }
  );

  if (loading) return <div className="skeleton h-64" />;

  return (
    <div className="page-fade space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-2xl font-bold">Workout history</h1>
          <p className="text-[13px] text-ink-muted">Every completed session with real logged sets.</p>
        </div>
        <Link to="/app/workouts"><Button variant="secondary" size="sm">Back</Button></Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["Sessions", formatNumber(totals.sessions)],
          ["Time trained", `${formatNumber(totals.minutes)} min`],
          ["Total volume", `${formatNumber(Math.round(totals.volume))} kg`],
        ].map(([label, value]) => (
          <Card key={label} className="text-center">
            <p className="display text-xl font-bold tnum">{value}</p>
            <p className="text-[12px] text-ink-muted">{label}</p>
          </Card>
        ))}
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Dumbbell />}
          title="No workouts yet"
          description="Finish your first session and it will show up here."
          action={<Link to="/app/workouts"><Button size="sm">Find a workout</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink">{s.workout_name}</h2>
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                    <CalendarClock className="h-3.5 w-3.5" /> {formatDate(s.session_date)}
                    <Timer className="ml-2 h-3.5 w-3.5" /> {s.duration_minutes ?? "?"} min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{s.exercises_completed}/{s.exercises_total} exercises</Badge>
                  <Badge>{formatNumber(Math.round(s.total_volume_kg))} kg</Badge>
                </div>
              </div>

              {s.session_data?.length > 0 && (
                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-[13px] font-medium text-accent-300">View logged sets</summary>
                  <div className="mt-2 space-y-2">
                    {s.session_data.map((ex, i) => (
                      <div key={i}>
                        <p className="text-[13px] font-medium text-ink">{ex.name}</p>
                        <p className="text-[12px] text-ink-muted tnum">
                          {ex.sets.map((set) => `${set.weight != null ? `${set.weight}kg` : "BW"}×${set.reps}`).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
