import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GripVertical, Plus, Save, Search, Trash2 } from "lucide-react";
import { Card, Button, Input, Select, Badge } from "../components/ui";
import { useData } from "../context/DataContext";
import { cn } from "../lib/utils";
import type { Exercise, MuscleGroup, WorkoutCategory } from "../lib/types";

interface Line { exercise_id: string; sets: number; reps: string; rest_seconds: number; notes: string; }

const CATEGORIES: WorkoutCategory[] = ["push", "pull", "legs", "full_body", "upper", "lower", "bro_split", "cardio", "custom"];

export default function WorkoutBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userWorkouts, exercises, saveWorkout, deleteWorkout, createExercise } = useData();

  const editing = useMemo(
    () => [...userWorkouts].find((w) => w.id === id) ?? null,
    [userWorkouts, id]
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WorkoutCategory>("custom");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [minutes, setMinutes] = useState(45);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // custom exercise form
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customGroup, setCustomGroup] = useState<MuscleGroup>("chest");
  const [customEquipment, setCustomEquipment] = useState("bodyweight");
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description);
      setCategory(editing.category);
      setDifficulty(editing.difficulty);
      setMinutes(editing.estimated_minutes);
      setLines(
        (editing.workout_exercises ?? []).map((we) => ({
          exercise_id: we.exercise_id,
          sets: we.sets,
          reps: we.reps,
          rest_seconds: we.rest_seconds,
          notes: we.notes,
        }))
      );
      setLoaded(true);
    } else if (id === undefined) {
      setLoaded(true);
    }
  }, [editing, id, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (group === "all" || e.muscle_group === group) &&
        (!q || e.name.toLowerCase().includes(q) || e.equipment.includes(q))
    );
  }, [exercises, search, group]);

  function addExercise(ex: Exercise) {
    setLines((ls) => [...ls, { exercise_id: ex.id, sets: 3, reps: "10", rest_seconds: 90, notes: "" }]);
  }

  async function saveCustomExercise() {
    setCustomError(null);
    const nm = customName.trim();
    if (!nm) return setCustomError("Give your exercise a name.");
    setCustomBusy(true);
    const { error: err, exercise } = await createExercise({
      name: nm,
      muscle_group: customGroup,
      equipment: customEquipment,
    });
    setCustomBusy(false);
    if (err || !exercise) {
      setCustomError(err ?? "Could not save the exercise. Please try again.");
      return;
    }
    addExercise(exercise);
    setCustomName("");
    setShowCustom(false);
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    setLines((ls) => {
      const next = [...ls];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return ls;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the workout a name.");
    if (!lines.length) return setError("Add at least one exercise.");
    setBusy(true);
    // If editing, create the replacement FIRST and only delete the
    // original after it saved — deleting first meant a failed save
    // permanently lost the workout.
    const { error, id } = await saveWorkout(
      { name: name.trim(), description, category, difficulty, estimated_minutes: minutes },
      lines.map((l, i) => ({ ...l, position: i }))
    );
    if (error || !id) {
      setBusy(false);
      setError(error ?? "Could not save the workout. Your original was kept.");
      return;
    }
    if (editing && editing.id !== id) {
      const { error: delErr } = await deleteWorkout(editing.id);
      if (delErr) {
        // Replacement saved but the old copy survived — surface it so the
        // user can clean up manually; nothing was lost.
        setBusy(false);
        setError(`Saved, but the old copy could not be removed: ${delErr}`);
        return;
      }
    }
    setBusy(false);
    navigate("/app/workouts", { replace: true });
  }

  const estMinutes = useMemo(
    () => lines.reduce((a, l) => a + l.sets * ((l.rest_seconds + 40) / 60), 0),
    [lines]
  );

  return (
    <div className="page-fade space-y-5">
      <div>
        <button className="flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink" onClick={() => navigate("/app/workouts")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Workouts
        </button>
        <h1 className="display mt-1 text-2xl font-bold">{editing ? "Edit workout" : "Add Exercises"}</h1>
      </div>

      <Card>
        <h2 className="font-semibold">Details</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Day A" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Heavy pressing focus" />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as WorkoutCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Difficulty</label>
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Planned minutes</label>
            <Input type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Estimated from plan</label>
            <p className="field bg-surface-2">{Math.round(estMinutes)} min</p>
          </div>
        </div>
      </Card>

      {/* selected exercises */}
      <Card>
        <h2 className="font-semibold">Exercises ({lines.length})</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-faint">Pick exercises from the library below.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lines.map((l, idx) => {
              const ex = exercises.find((e) => e.id === l.exercise_id);
              return (
                <li key={`${l.exercise_id}-${idx}`} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-ink-faint" />
                    <span className="flex-1 truncate text-[14px] font-medium text-ink">{ex?.name ?? "Exercise"}</span>
                    <button className="cursor-pointer rounded-md px-1.5 text-ink-faint hover:text-ink" onClick={() => move(idx, -1)} aria-label="Move up">↑</button>
                    <button className="cursor-pointer rounded-md px-1.5 text-ink-faint hover:text-ink" onClick={() => move(idx, 1)} aria-label="Move down">↓</button>
                    <button className="cursor-pointer text-ink-faint hover:text-danger" onClick={() => removeLine(idx)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-faint">Sets</label>
                      <Input type="number" min={1} max={20} value={l.sets} onChange={(e) => updateLine(idx, { sets: Number(e.target.value) || 1 })} className="h-9" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-faint">Reps</label>
                      <Input value={l.reps} onChange={(e) => updateLine(idx, { reps: e.target.value })} className="h-9" placeholder="8-12" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-faint">Rest s</label>
                      <Input type="number" min={0} max={600} value={l.rest_seconds} onChange={(e) => updateLine(idx, { rest_seconds: Number(e.target.value) || 0 })} className="h-9" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-faint">Notes</label>
                      <Input value={l.notes} onChange={(e) => updateLine(idx, { notes: e.target.value })} className="h-9" placeholder="optional" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* library picker */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Exercise library</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises…" className="w-56 pl-9" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["all", "chest", "back", "shoulders", "arms", "legs", "core", "full_body", "cardio"].map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors",
                group === g ? "bg-accent-soft text-accent-300" : "bg-surface-2 text-ink-muted hover:text-ink"
              )}
            >
              {g.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {/* Create own exercise — always on top */}
          {!showCustom ? (
            <button
              onClick={() => { setShowCustom(true); setCustomError(null); }}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-accent px-3 py-2.5 text-left transition-colors hover:bg-accent-soft"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">Create own exercise</p>
                <p className="text-[12px] text-ink-faint">Add a custom exercise with your own name</p>
              </div>
              <Plus className="h-4 w-4 text-accent-300" />
            </button>
          ) : (
            <div className="rounded-xl border border-accent bg-surface-2 p-3 sm:col-span-2">
              <p className="text-[14px] font-medium text-ink">Create own exercise</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] text-ink-faint">Exercise name</label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Incline DB Fly"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-faint">Muscle group</label>
                  <Select value={customGroup} onChange={(e) => setCustomGroup(e.target.value as MuscleGroup)} className="h-9">
                    {(["chest", "back", "shoulders", "arms", "legs", "core", "full_body", "cardio"] as MuscleGroup[]).map((g) => (
                      <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-faint">Equipment</label>
                  <Select value={customEquipment} onChange={(e) => setCustomEquipment(e.target.value)} className="h-9">
                    {["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "cardio"].map((eq) => (
                      <option key={eq} value={eq}>{eq}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowCustom(false); setCustomError(null); }}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={customBusy} onClick={saveCustomExercise}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>
              {customError && <p className="mt-2 text-[13px] text-danger">{customError}</p>}
            </div>
          )}
          {filtered.map((ex) => {
            const added = lines.some((l) => l.exercise_id === ex.id);
            return (
              <button
                key={ex.id}
                onClick={() => !added && addExercise(ex)}
                disabled={added}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-left transition-colors",
                  added ? "opacity-50" : "hover:border-accent hover:bg-accent-soft"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {ex.name}
                    {ex.user_id && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-300">Custom</span>}
                  </p>
                  <p className="text-[12px] text-ink-faint">{ex.muscle_group} · {ex.equipment}{ex.is_compound ? " · compound" : ""}</p>
                </div>
                {added ? <Badge tone="success">Added</Badge> : <Plus className="h-4 w-4 text-ink-faint" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-[13px] text-ink-faint">No exercises match.</p>}
        </div>
      </Card>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="sticky bottom-20 flex gap-2 lg:bottom-6">
        <Button variant="secondary" className="flex-1" onClick={() => navigate("/app/workouts")}>Cancel</Button>
        <Button className="flex-[2]" loading={busy} onClick={save}><Save className="h-4 w-4" /> Save workout</Button>
      </div>
    </div>
  );
}
