import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ScanLine, Sparkles, Trash2, Zap } from "lucide-react";
import { Card, Button, Input, Select } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { FoodScanner } from "../components/FoodScanner";
import { askCoach } from "../lib/aiClient";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { formatNumber, todayKey } from "../lib/utils";
import type { FoodEntry, MealType } from "../lib/types";

const MEALS: { type: MealType; label: string }[] = [
  { type: "breakfast", label: "Breakfast" },
  { type: "lunch", label: "Lunch" },
  { type: "dinner", label: "Dinner" },
  { type: "snack", label: "Snacks" },
];

const QUICK_ADDS: { name: string; calories: number; protein: number; carbs: number; fat: number }[] = [
  { name: "Whey protein shake (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: "Boiled egg", calories: 78, protein: 6, carbs: 0.6, fat: 5 },
  { name: "Banana (medium)", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: "Chicken breast (100 g)", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: "White rice (100 g cooked)", calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { name: "Greek yogurt (170 g)", calories: 100, protein: 17, carbs: 6, fat: 0.7 },
  { name: "Oats (40 g dry)", calories: 152, protein: 5, carbs: 27, fat: 2.6 },
  { name: "Almonds (28 g)", calories: 164, protein: 6, carbs: 6, fat: 14 },
];

interface FoodForm {
  name: string;
  servings: string;
  serving_label: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  meal_type: MealType;
}

const EMPTY: FoodForm = { name: "", servings: "1", serving_label: "serving", calories: "", protein: "", carbs: "", fat: "", meal_type: "snack" };

export default function Nutrition() {
  const { today, todayEntries, deleteFood, addFood, loading } = useData();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FoodForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* AI meal suggestions for the empty state */
  const [ideas, setIdeas] = useState<string | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  /* quick-add in-flight guard: key of the chip currently being logged */
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  /* Diary / Scan tabs — deep-linkable via ?mode=scan */
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"diary" | "scan">(
    params.get("mode") === "scan" ? "scan" : "diary"
  );
  function selectTab(t: "diary" | "scan") {
    setTab(t);
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (t === "scan") next.set("mode", "scan");
      else next.delete("mode");
      return next;
    }, { replace: true });
  }

  async function loadIdeas() {
    setIdeasBusy(true);
    setIdeasError(null);
    setIdeas(null);
    try {
      const { reply } = await askCoach(
        [
          {
            role: "user",
            content:
              "Nothing is logged in my food diary today. Suggest 3 quick meal ideas for the rest of today that fit my remaining calories and protein. For each: name, rough calories and protein, one line why it fits. Keep it under 120 words.",
          },
        ],
        {
          name: profile?.display_name,
          goal: profile?.primary_goal ?? undefined,
          calorieTarget: profile?.calorie_target ?? undefined,
          proteinTarget: profile?.protein_target ?? undefined,
          todayCalories: today.calories,
          todayProtein: today.protein,
          dietaryPreferences: profile?.dietary_preferences ?? [],
        }
      );
      setIdeas(reply);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : "Could not load suggestions.");
    } finally {
      setIdeasBusy(false);
    }
  }

  // Fresh suggestions whenever the diary is empty and none are loaded.
  useEffect(() => {
    if (todayEntries.length === 0 && !ideas && !ideasBusy && !ideasError) void loadIdeas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntries.length]);

  const set = <K extends keyof FoodForm>(k: K, v: FoodForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const byMeal = useMemo(() => {
    const map: Record<MealType, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const e of todayEntries) map[e.meal_type].push(e);
    return map;
  }, [todayEntries]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const servings = Math.max(0.1, Number(form.servings) || 1);
    if (!form.name.trim()) return setError("Give the food a name.");
    if (!form.calories && !form.protein && !form.carbs && !form.fat) {
      return setError("Enter at least calories or a macro.");
    }
    setBusy(true);
    // Per-serving inputs are multiplied by servings at log time.
    const { error } = await addFood({
      entry_date: todayKey(),
      meal_type: form.meal_type,
      name: form.name.trim(),
      servings,
      serving_label: form.serving_label || null,
      calories: Math.round((Number(form.calories) || 0) * servings),
      protein_g: Math.round((Number(form.protein) || 0) * servings),
      carbs_g: Math.round((Number(form.carbs) || 0) * servings),
      fat_g: Math.round((Number(form.fat) || 0) * servings),
      source: "manual",
      ai_confidence: null,
    });
    setBusy(false);
    if (error) setError(error);
    else {
      setForm(EMPTY);
      setOpen(false);
    }
  }

  if (loading) return <div className="skeleton h-64" />;

  const remaining = (profile?.calorie_target ?? 0) - today.calories;

  return (
    <div className="page-fade space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-bold">Nutrition</h1>
          <p className="text-[13px] text-ink-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-line bg-surface-1 p-1">
            {(["diary", "scan"] as const).map((t) => (
              <button
                key={t}
                onClick={() => selectTab(t)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t ? "bg-accent-soft text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t === "scan" && <ScanLine className="h-4 w-4" />}
                {t === "diary" ? "Diary" : "Scan Your Food"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "scan" ? (
        <FoodScanner />
      ) : (
      <>

      {/* Totals vs targets */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Calories", today.calories, profile?.calorie_target, "kcal"],
            ["Protein", today.protein, profile?.protein_target, "g"],
            ["Carbs", today.carbs, profile?.carb_target, "g"],
            ["Fat", today.fat, profile?.fat_target, "g"],
          ].map(([label, value, target, unit]) => {
            const t = (target as number | null) ?? 0;
            const pct = t ? Math.min(999, Math.round(((value as number) / t) * 100)) : 0;
            return (
              <div key={label as string} className="rounded-xl bg-surface-2 p-4">
                <p className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</p>
                <p className="display mt-1 text-xl font-bold tnum">
                  {formatNumber(value as number)}
                  <span className="text-[13px] font-medium text-ink-muted"> / {formatNumber(t)} {unit}</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${pct > 110 ? "bg-data-amber" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {profile?.calorie_target ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            {remaining >= 0
              ? <><Zap className="mr-1 inline h-3.5 w-3.5 text-accent-300" />{formatNumber(remaining)} kcal remaining today</>
              : <span className="text-data-amber">{formatNumber(-remaining)} kcal over target</span>}
          </p>
        ) : null}
      </Card>

      {/* Add form */}
      {open && (
        <Card>
          <h2 className="font-semibold">Add food — {form.meal_type}</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Food</label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Chicken & rice bowl" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Meal</label>
                <Select value={form.meal_type} onChange={(e) => set("meal_type", e.target.value as MealType)}>
                  {MEALS.map((m) => <option key={m.type} value={m.type}>{m.label}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Servings</label>
                  <Input type="number" min="0.1" step="0.1" value={form.servings} onChange={(e) => set("servings", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Serving label</label>
                  <Input value={form.serving_label} onChange={(e) => set("serving_label", e.target.value)} placeholder="bowl" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Calories (per serving)</label>
                <Input type="number" min="0" value={form.calories} onChange={(e) => set("calories", e.target.value)} placeholder="520" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Protein g</label>
                  <Input type="number" min="0" value={form.protein} onChange={(e) => set("protein", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Carbs g</label>
                  <Input type="number" min="0" value={form.carbs} onChange={(e) => set("carbs", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Fat g</label>
                  <Input type="number" min="0" value={form.fat} onChange={(e) => set("fat", e.target.value)} />
                </div>
              </div>
            </div>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Add to diary</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Quick add chips */}
      <Card>
        <h2 className="font-semibold">Quick add</h2>
        <p className="text-[13px] text-ink-muted">One tap logs one serving as a snack.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ADDS.map((q) => (
            <button
              key={q.name}
              disabled={quickBusy !== null}
              onClick={async () => {
                if (quickBusy) return;
                setQuickBusy(q.name);
                await addFood({
                  entry_date: todayKey(),
                  meal_type: "snack",
                  name: q.name,
                  servings: 1,
                  serving_label: "serving",
                  calories: q.calories,
                  protein_g: q.protein,
                  carbs_g: q.carbs,
                  fat_g: q.fat,
                  source: "quick",
                  ai_confidence: null,
                });
                setQuickBusy(null);
              }}
              className="cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-accent hover:bg-accent-soft disabled:cursor-wait disabled:opacity-60"
            >
              {q.name} <span className="text-ink-faint">· {q.calories} kcal</span>
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" /> Add food manually
        </Button>
      </Card>

      {/* Empty-day AI suggestions */}
      {todayEntries.length === 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-300" />
            <h2 className="font-semibold">Need ideas for today?</h2>
          </div>
          {ideasBusy && (
            <div className="mt-3 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          )}
          {ideasError && (
            <div className="mt-3">
              <p className="text-[13px] text-ink-muted">{ideasError}</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadIdeas()}>
                Try again
              </Button>
            </div>
          )}
          {ideas && (
            <div className="mt-2 text-[14px] text-ink-muted">
              <Markdown text={ideas} />
            </div>
          )}
        </Card>
      )}

      {/* Meals */}
      <div className="space-y-3">
        {MEALS.map((m) => {
          const entries = byMeal[m.type];
          const kcal = entries.reduce((a, e) => a + e.calories, 0);
          return (
            <Card key={m.type}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{m.label}</h2>
                <span className="text-[13px] tnum text-ink-muted">{formatNumber(kcal)} kcal</span>
              </div>                  {entries.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-faint">Nothing logged yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {e.name}
                          {e.source === "ai_scan" && <span className="ml-2 text-[11px] font-semibold uppercase text-accent-300">AI</span>}
                        </p>
                        <p className="text-[12px] text-ink-faint">
                          {formatNumber(e.servings, e.servings % 1 ? 1 : 0)} × {e.serving_label ?? "serving"} · P {e.protein_g} · C {e.carbs_g} · F {e.fat_g}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] tnum text-ink-muted">{formatNumber(e.calories)} kcal</span>
                        <button onClick={() => void deleteFood(e.id)} className="cursor-pointer text-ink-faint transition-colors hover:text-danger" aria-label={`Delete ${e.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
