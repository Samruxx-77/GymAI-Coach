import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw, ScanLine, TriangleAlert } from "lucide-react";
import { Card, Button, Input, Badge, EmptyState } from "../components/ui";
import { scanFood, fileToDownscaledBase64, type FoodScanResponse } from "../lib/aiClient";
import { useData } from "../context/DataContext";
import { formatNumber, todayKey } from "../lib/utils";
import type { MealType } from "../lib/types";

/** Time window (ms) in which logging an identical entry is blocked. */
const DUPE_WINDOW_MS = 60_000;

export function FoodScanner() {
  const { addFood, today } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  /** The exact file the user last picked — analyze() uses this instead of
   * re-reading the two inputs, so a gallery photo can never leak into a
   * camera analysis (or vice versa) when both inputs hold files. */
  const pickedFile = useRef<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupeWarning, setDupeWarning] = useState<{ name: string; calories: number } | null>(null);
  const [result, setResult] = useState<FoodScanResponse | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [logged, setLogged] = useState(false);
  const [edit, setEdit] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });

  /** Last logged signature for the short-window duplicate guard. */
  const lastLogged = useRef<{ sig: string; at: number } | null>(null);

  // Analyze phase progress messages (real states, not a fake timer).
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!busy) {
      setPhase(0);
      return;
    }
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 4500);
    return () => clearInterval(id);
  }, [busy]);

  function pick(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    setDupeWarning(null);
    setResult(null);
    setLogged(false);
    pickedFile.current = file;
    // Clear both inputs: the File object is kept in pickedFile, so stale
    // files can never be re-read by analyze().
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!preview || busy) return; // in-flight guard: no double analyze
    setBusy(true);
    setError(null);
    try {
      const input = pickedFile.current;
      if (!input) throw new Error("Choose a photo first.");
      const base64 = await fileToDownscaledBase64(input);
      const data = await scanFood(base64);
      setResult(data);
      setLogged(false);
      setEdit({
        name: data.name,
        calories: String(data.calories),
        protein: String(data.proteinG),
        carbs: String(data.carbsG),
        fat: String(data.fatG),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed. Try another photo.");
    } finally {
      setBusy(false);
    }
  }

  function signature(name: string, calories: number, protein: number) {
    return `${name.trim().toLowerCase()}|${calories}|${protein}`;
  }

  async function log(force = false) {
    if (!result || logBusy) return; // in-flight guard: no double log
    const name = edit.name || result.name;
    const calories = Math.round(Number(edit.calories) || 0);
    const protein = Math.round(Number(edit.protein) || 0);

    // Short-window duplicate guard: identical entry just logged → ask inline.
    const sig = signature(name, calories, protein);
    const recent = lastLogged.current;
    if (!force && recent && recent.sig === sig && Date.now() - recent.at < DUPE_WINDOW_MS) {
      setDupeWarning({ name, calories });
      return;
    }
    setDupeWarning(null);

    setLogBusy(true);
    setError(null);
    const { error } = await addFood({
      entry_date: todayKey(),
      meal_type: mealType,
      name,
      servings: 1,
      serving_label: result.servingEstimate,
      calories,
      protein_g: protein,
      carbs_g: Math.round(Number(edit.carbs) || 0),
      fat_g: Math.round(Number(edit.fat) || 0),
      source: "ai_scan",
      ai_confidence: result.confidence,
    });
    setLogBusy(false);
    if (!error) {
      lastLogged.current = { sig, at: Date.now() };
      setLogged(true);
      pickedFile.current = null;
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    } else {
      setError(error);
    }
  }

  return (
    <div className="page-fade space-y-5">
      <Card>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        {!preview ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
              <Camera className="h-7 w-7 text-accent-300" />
            </div>
            <p className="max-w-xs text-center text-[14px] text-ink-muted">
              Take a photo of your meal or upload one from your gallery.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => cameraRef.current?.click()}>Open camera</Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload photo</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,240px)_1fr]">
            <div>
              <img src={preview} alt="Meal preview" className="aspect-square w-full rounded-xl object-cover" />
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setPreview(null); setResult(null); setLogged(false); pickedFile.current = null; }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retake
                </Button>
                {!result && (
                  <Button size="sm" loading={busy} disabled={busy} onClick={analyze}>Analyze</Button>
                )}
              </div>
            </div>

            <div>
              {error && (
                <p className="mb-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              {busy && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="relative flex h-14 w-14 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-2xl bg-accent-soft" />
                    <ScanLine className="relative h-8 w-8 text-accent-300" />
                  </span>
                  <p className="text-[14px] font-medium text-ink">Analyzing your meal…</p>
                  <p className="text-[13px] text-ink-muted">{PHASES[phase]}</p>
                  <p className="max-w-[240px] text-[12px] text-ink-faint">
                    Vision models on the free tier can take up to a minute. Keep this page open.
                  </p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={result.confidence >= 0.75 ? "success" : result.confidence >= 0.5 ? "warning" : "danger"}>
                      {Math.round(result.confidence * 100)}% confidence
                    </Badge>
                    <Badge>{result.servingEstimate}</Badge>
                    {result.sanity === "uncertain" && <Badge tone="warning">Sanity check — review macros</Badge>}
                    {result.fallbackUsed && <Badge>fallback provider</Badge>}
                  </div>

                  <p className="text-[13px] text-ink-muted">Estimates only — adjust before logging.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Food name</label>
                      <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
                    </div>
                    {[
                      ["Calories", "calories"], ["Protein g", "protein"], ["Carbs g", "carbs"], ["Fat g", "fat"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">{label}</label>
                        <Input
                          type="number" min="0"
                          value={edit[key as keyof typeof edit]}
                          onChange={(e) => setEdit((s) => ({ ...s, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>

                  {result.items.length > 1 && (
                    <div className="rounded-xl bg-surface-2 p-3">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Detected components</p>
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {result.items.map((it, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="truncate text-ink">{it.name}</span>
                            <span className="shrink-0 tnum text-ink-muted">{it.calories} kcal</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={mealType}
                      onChange={(e) => setMealType(e.target.value as MealType)}
                      className="field h-10 w-auto cursor-pointer appearance-none pr-8"
                    >
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                      <option value="snack">Snack</option>
                    </select>
                    {logged ? (
                      <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Logged — scan another or retake</Badge>
                    ) : (
                      <Button onClick={() => log()} loading={logBusy} disabled={logBusy}>
                        <CheckCircle2 className="h-4 w-4" /> Log to diary
                      </Button>
                    )}
                    {dupeWarning && !logged && (
                      <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-data-amber/10 px-3 py-2 text-[13px] text-ink">
                        <TriangleAlert className="h-4 w-4 shrink-0 text-data-amber" />
                        <span className="flex-1">“{dupeWarning.name}” ({formatNumber(dupeWarning.calories)} kcal) was just logged. Add it again?</span>
                        <Button size="sm" variant="secondary" onClick={() => log(true)} disabled={logBusy}>Yes, add again</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDupeWarning(null)}>Keep single</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!busy && !result && !error && (
                <EmptyState
                  title="Ready when you are"
                  description="Tap Analyze to estimate nutrition from the photo."
                  className="py-6"
                />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Today so far */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Logged today</h2>
          <span className="text-[13px] tnum text-ink-muted">
            {formatNumber(today.calories)} kcal · P {formatNumber(today.protein)} g
          </span>
        </div>
        {today.entries.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-faint">Nothing yet — your scan will appear here once logged.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[14px]">
            {today.entries.slice(0, 6).map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="truncate text-ink-muted">{e.name}</span>
                <span className="tnum text-ink">{e.calories} kcal</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Rotating honesty about what the analyzer is doing. */
const PHASES = [
  "Uploading your photo…",
  "Identifying the food…",
  "Estimating portion size…",
  "Calculating macros…",
  "Still working — free-tier vision models are slow…",
];
