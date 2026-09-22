import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Timer, X } from "lucide-react";
import { Card, Button, ProgressBar, Input, EmptyState } from "../components/ui";
import { useData } from "../context/DataContext";
import { cn, todayKey } from "../lib/utils";
import type { SessionExerciseLog } from "../lib/types";

interface DraftSet { weight: string; reps: string; done: boolean; }

export default function WorkoutSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { templates, userWorkouts, logSession, loading } = useData();
  const workout = useMemo(
    () => [...templates, ...userWorkouts].find((w) => w.id === id) ?? null,
    [templates, userWorkouts, id]
  );

  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, DraftSet[]>>({});
  const startRef = useRef(Date.now());
  // Two-step quit: first tap arms, second tap confirms (auto-disarms after 5s).
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const quitTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(quitTimer.current), []);

  /* init per-exercise drafts from template reps */
  useEffect(() => {
    if (!workout?.workout_exercises) return;
    const next: Record<string, DraftSet[]> = {};
    for (const we of workout.workout_exercises) {
      const n = we.sets;
      const baseRep = parseInt(we.reps, 10) || 10;
      next[we.exercise_id] = Array.from({ length: n }, () => ({ weight: "", reps: String(baseRep), done: false }));
    }
    setLogs(next);
  }, [workout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* elapsed + rest timers — one stable interval; the rest countdown
     lives in a ref so the interval is never recreated every second. */
  const restLeftRef = useRef<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      if (restLeftRef.current != null) {
        if (restLeftRef.current <= 1) {
          restLeftRef.current = null;
          setRestLeft(null);
        } else {
          restLeftRef.current -= 1;
          setRestLeft(restLeftRef.current);
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function startRest(seconds: number) {
    restLeftRef.current = seconds;
    setRestLeft(seconds);
  }

  if (loading) {
    return (
      <div className="page-fade space-y-5">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (!workout) {
    return <EmptyState title="Workout not found" description="It may have been deleted." action={<Button onClick={() => navigate("/app/workouts")}>Back to workouts</Button>} />;
  }

  const plan = workout.workout_exercises ?? [];

  function setField(exId: string, idx: number, field: "weight" | "reps", value: string) {
    setLogs((prev) => {
      const rows = [...(prev[exId] ?? [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [exId]: rows };
    });
  }
  function toggleDone(exId: string, idx: number, restSeconds: number) {
    setLogs((prev) => {
      const rows = [...(prev[exId] ?? [])];
      rows[idx] = { ...rows[idx], done: !rows[idx].done };
      return { ...prev, [exId]: rows };
    });
    // start rest timer when completing a set
    const row = logs[exId]?.[idx];
    if (!row?.done && restSeconds > 0) startRest(restSeconds);
  }

  const totalSets = plan.reduce((a, we) => a + we.sets, 0);
  const doneSets = Object.values(logs).reduce(
    (a, rows) => a + rows.filter((r) => r.done).length,
    0
  );

  function volumeKg(): number {
    let vol = 0;
    for (const we of plan) {
      for (const r of logs[we.exercise_id] ?? []) {
        if (r.done && r.weight) vol += Number(r.weight) * (Number(r.reps) || 0);
      }
    }
    return Math.round(vol * 10) / 10;
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const sessionData: SessionExerciseLog[] = [];
    let completed = 0;
    for (const we of plan) {
      const rows = (logs[we.exercise_id] ?? []).filter((r) => r.done);
      if (!rows.length) continue;
      completed += 1;
      sessionData.push({
        exerciseId: we.exercise_id,
        name: we.exercises?.name ?? "Exercise",
        sets: rows.map((r) => ({ weight: r.weight ? Number(r.weight) : null, reps: Number(r.reps) || 0 })),
      });
    }
    if (completed === 0) {
      setBusy(false);
      setError("Log at least one set before finishing.");
      return;
    }
    const { error } = await logSession({
      workout_id: workout!.id,
      workout_name: workout!.name,
      session_date: todayKey(),
      duration_minutes: Math.max(1, Math.round(elapsed / 60)),
      total_volume_kg: volumeKg(),
      exercises_completed: completed,
      exercises_total: plan.length,
      session_data: sessionData,
      notes: null,
    });
    setBusy(false);
    if (error) setError(error);
    else navigate("/app/workouts/history", { replace: true });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="page-fade space-y-5">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button className="flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink" onClick={() => navigate("/app/workouts")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Workouts
          </button>
          <h1 className="display mt-1 text-2xl font-bold">{workout.name}</h1>
        </div>
        <div className="text-right">
          <p className="display text-2xl font-bold tnum text-ink">{mm}:{ss}</p>
          <p className="text-[12px] text-ink-faint">elapsed</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-ink-muted"><span className="font-semibold text-ink">{doneSets}</span> / {totalSets} sets done</span>
          <span className="tnum text-ink-muted">{volumeKg()} kg volume</span>
        </div>
        <ProgressBar className="mt-2" value={totalSets ? (doneSets / totalSets) * 100 : 0} />
      </Card>

      {/* rest timer banner */}
      {restLeft != null && (
        <Card className="border-accent/40 bg-accent-soft">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <Timer className="h-4 w-4 text-accent-300" /> Rest
            </span>
            <div className="flex items-center gap-3">
              <span className="display text-xl font-bold tnum">{restLeft}s</span>
              <Button size="sm" variant="ghost" onClick={() => { restLeftRef.current = null; setRestLeft(null); }}><X className="h-3.5 w-3.5" /> Skip</Button>
            </div>
          </div>
        </Card>
      )}

      {/* exercises */}
      {plan.map((we, i) => {
        const rows = logs[we.exercise_id] ?? [];
        const ex = we.exercises;
        return (
          <Card key={we.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-[13px] font-bold text-ink-muted">{i + 1}</span>
                <div>
                  <h2 className="font-semibold text-ink">{ex?.name ?? "Exercise"}</h2>
                  <p className="text-[12px] text-ink-faint">
                    {we.sets} sets × {we.reps} · rest {we.rest_seconds}s{ex ? ` · ${ex.equipment}` : ""}
                  </p>
                </div>
              </div>
            </div>
            {ex?.tips && (
              <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-muted">💡 {ex.tips}</p>
            )}
            <div className="mt-3 space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-[12px] text-ink-faint">Set {idx + 1}</span>
                  <Input
                    type="number" min="0" step="0.5" placeholder="kg"
                    value={row.weight} onChange={(e) => setField(we.exercise_id, idx, "weight", e.target.value)}
                    className="h-9 w-24"
                  />
                  <span className="text-[12px] text-ink-faint">kg ×</span>
                  <Input
                    type="number" min="0" placeholder="reps"
                    value={row.reps} onChange={(e) => setField(we.exercise_id, idx, "reps", e.target.value)}
                    className="h-9 w-20"
                  />
                  <button
                    onClick={() => toggleDone(we.exercise_id, idx, we.rest_seconds)}
                    className={cn(
                      "ml-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors",
                      row.done ? "border-success bg-success/15 text-success" : "border-line text-ink-faint hover:border-accent hover:text-accent-300"
                    )}
                    aria-label={`Mark set ${idx + 1} done`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="sticky bottom-20 flex gap-2 lg:bottom-6">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            if (confirmingQuit) navigate("/app/workouts");
            else {
              setConfirmingQuit(true);
              quitTimer.current = window.setTimeout(() => setConfirmingQuit(false), 5000);
            }
          }}
        >
          <X className="h-4 w-4" /> {confirmingQuit ? "Tap again to quit" : "Quit"}
        </Button>
        <Button className="flex-[2]" loading={busy} onClick={finish}>
          <Check className="h-4 w-4" /> Finish workout
        </Button>
      </div>
    </div>
  );
}
