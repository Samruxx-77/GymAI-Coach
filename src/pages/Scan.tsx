import { useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { Card, Button, Input, Badge, EmptyState } from "../components/ui";
import { scanFood, fileToDownscaledBase64, type FoodScanResponse } from "../lib/aiClient";
import { useData } from "../context/DataContext";
import { formatNumber, todayKey } from "../lib/utils";
import type { MealType } from "../lib/types";

export default function Scan() {
  const { addFood, today } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResponse | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [edit, setEdit] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });

  function pick(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const input = fileRef.current?.files?.[0] ?? cameraRef.current?.files?.[0];
      if (!input) throw new Error("Choose a photo first.");
      const base64 = await fileToDownscaledBase64(input);
      const data = await scanFood(base64);
      setResult(data);
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

  async function log() {
    if (!result) return;
    const { error } = await addFood({
      entry_date: todayKey(),
      meal_type: mealType,
      name: edit.name || result.name,
      servings: 1,
      serving_label: result.servingEstimate,
      calories: Math.round(Number(edit.calories) || 0),
      protein_g: Math.round(Number(edit.protein) || 0),
      carbs_g: Math.round(Number(edit.carbs) || 0),
      fat_g: Math.round(Number(edit.fat) || 0),
      source: "ai_scan",
      ai_confidence: result.confidence,
    });
    if (!error) {
      setResult(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    } else {
      setError(error);
    }
  }

  return (
    <div className="page-fade space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Food scanner</h1>
        <p className="text-[13px] text-ink-muted">Photograph a meal — get editable calorie and macro estimates.</p>
      </div>

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
                <Button variant="secondary" size="sm" onClick={() => { setPreview(null); setResult(null); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retake
                </Button>
                {!result && (
                  <Button size="sm" loading={busy} onClick={analyze}>Analyze</Button>
                )}
              </div>
            </div>

            <div>
              {error && (
                <p className="mb-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              {busy && <div className="skeleton h-48" />}

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

                  <div className="flex items-center gap-2">
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
                    <Button onClick={log}><CheckCircle2 className="h-4 w-4" /> Log to diary</Button>
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
