import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Dumbbell, History, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Card, Button, Badge, EmptyState } from "../components/ui";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { ProgressBar } from "../components/ui";

export default function Workouts() {
  const { templates, userWorkouts, weekWorkoutCount, deleteWorkout } = useData();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"templates" | "mine">("templates");

  const weeklyTarget = profile?.weekly_workout_target ?? 3;

  return (
    <div className="page-fade space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-bold">Workouts</h1>
          <p className="text-[13px] text-ink-muted">Start a session, build your own, review history.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/app/workouts/history"><Button variant="secondary"><History className="h-4 w-4" /> History</Button></Link>
          <Link to="/app/workouts/new"><Button><Plus className="h-4 w-4" /> Add Exercises</Button></Link>
        </div>
      </div>

      {/* Weekly progress */}
      <Card>
        <div className="flex items-center justify-between text-[14px]">
          <span className="font-medium text-ink">This week</span>
          <span className="tnum text-ink-muted">
            <span className="font-semibold text-ink">{weekWorkoutCount}</span> / {weeklyTarget} sessions
          </span>
        </div>
        <ProgressBar className="mt-3" value={(weekWorkoutCount / weeklyTarget) * 100} tone="success" />
      </Card>

      {/* Tabs */}
      <div className="flex gap-2">
        {(
          [
            ["templates", "Templates"],
            ["mine", `My workouts (${userWorkouts.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors " +
              (tab === key ? "bg-accent-soft text-accent-300" : "bg-surface-2 text-ink-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Workout cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(tab === "templates" ? templates : userWorkouts).map((w) => {
          const exCount = w.workout_exercises?.length ?? 0;
          return (
            <Card key={w.id} className="card-hover flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink">{w.name}</h2>
                    <Badge tone="accent">{w.difficulty}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">{w.description}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                  <Dumbbell className="h-5 w-5 text-accent-300" />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink-faint">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{w.estimated_minutes} min</span>
                <span className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> {exCount} exercises</span>
                <span className="flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" /> {w.category.replace(/_/g, " ")}</span>
              </div>

              {/* exercise preview */}
              {w.workout_exercises && w.workout_exercises.length > 0 && (
                <ol className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] text-ink-muted">
                  {w.workout_exercises.slice(0, 4).map((we) => (
                    <li key={we.id} className="flex justify-between gap-2">
                      <span className="truncate">{we.exercises?.name ?? "Exercise"}</span>
                      <span className="shrink-0 tnum">{we.sets}×{we.reps}</span>
                    </li>
                  ))}
                  {exCount > 4 && <li className="text-ink-faint">+{exCount - 4} more…</li>}
                </ol>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
                <Button size="sm" onClick={() => navigate(`/app/workouts/${w.id}/start`)}>
                  <Play className="h-3.5 w-3.5" /> Start
                </Button>
                {w.user_id != null && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/app/workouts/${w.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="ml-auto text-danger hover:bg-danger/10"
                      onClick={() => { if (confirm(`Delete "${w.name}"?`)) void deleteWorkout(w.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {tab === "templates" && templates.length === 0 && (
        <EmptyState icon={<Dumbbell />} title="No templates found" description="Run the supabase/schema.sql seed to load system workouts." />
      )}
      {tab === "mine" && userWorkouts.length === 0 && (
        <EmptyState
          icon={<Plus />}
          title="No custom workouts yet"
          description="Build a workout from the exercise library and reuse it any day."
          action={<Link to="/app/workouts/new"><Button size="sm">Build your first</Button></Link>}
        />
      )}
    </div>
  );
}
