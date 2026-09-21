import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Bar, BarChart,
} from "recharts";
import { Check, Pencil, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { Card, Button, Input, Badge } from "../components/ui";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { dayKey, goalProgressPercent, todayKey } from "../lib/utils";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Progress() {
  const { weightEntries, addWeight, updateWeight, deleteWeight, sessions, sessionOn, weightTrendKg } = useData();
  const { profile } = useProfile();
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /* inline edit state for the history list */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKg, setEditKg] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const today = todayKey();
  const existingToday = weightEntries.find((w) => w.entry_date === today);

  useEffect(() => {
    if (existingToday) setWeight(String(existingToday.weight_kg));
  }, [existingToday?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // One point per day (latest entry wins) with guaranteed numeric kg —
  // numeric columns can arrive as strings, which silently blank the chart.
  // If every weigh-in shares a single day, plot each entry instead so the
  // trend line appears from the 2nd weigh-in onward.
  const weightChart = useMemo(() => {
    const sorted = [...weightEntries]
      .filter((w) => Number.isFinite(Number(w.weight_kg)) && Number(w.weight_kg) > 0)
      .sort(
        (a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at)
      );
    if (sorted.length === 0) return [];

    const distinctDays = new Set(sorted.map((w) => w.entry_date));
    const multiDay = distinctDays.size >= 2;

    let rows: { date: string; kg: number; time: string }[];
    if (multiDay) {
      const byDay = new Map<string, { kg: number; time: string }>();
      for (const w of sorted) byDay.set(w.entry_date, { kg: Number(w.weight_kg), time: w.created_at });
      rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
    } else {
      rows = sorted.map((w) => ({ date: w.entry_date, kg: Number(w.weight_kg), time: w.created_at }));
    }

    return rows.slice(-60).map(({ date, kg, time }) => ({
      date:
        multiDay
          ? fmtDate(date)
          : `${fmtDate(date)} · ${new Date(time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
      kg,
    }));
  }, [weightEntries]);

  const volumeChart = useMemo(() => {
    // last 8 weeks ISO-ish buckets
    const weeks: { label: string; volume: number; sessions: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(Date.now() - (i * 7 + 6) * 86_400_000);
      const end = new Date(Date.now() - i * 7 * 86_400_000);
      const startK = start.toISOString().slice(0, 10);
      const endK = end.toISOString().slice(0, 10);
      const inWeek = sessions.filter((s) => s.session_date >= startK && s.session_date <= endK);
      weeks.push({
        label: fmtDate(endK),
        volume: Math.round(inWeek.reduce((a, s) => a + Number(s.total_volume_kg), 0)),
        sessions: inWeek.length,
      });
    }
    return weeks;
  }, [sessions]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(weight);
    if (!kg || kg < 25 || kg > 400) return setError("Enter a weight between 25 and 400 kg.");
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error } = await addWeight(today, kg, note || undefined);
    setBusy(false);
    if (error) setError(error);
    else {
      setSaved(true);
      setNote("");
    }
  }

  // streak calendar: last 56 days
  const streakDays = useMemo(() => {
    const days: { key: string; active: boolean }[] = [];
    for (let i = 55; i >= 0; i--) {
      const k = dayKey(new Date(Date.now() - i * 86_400_000));
      days.push({ key: k, active: sessionOn(k) });
    }
    return days;
  }, [sessionOn]);

  const weightProgress = goalProgressPercent(profile?.start_weight_kg ?? null, profile?.current_weight_kg ?? null, profile?.target_weight_kg ?? null);

  return (
    <div className="page-fade space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Progress</h1>
        <p className="text-[13px] text-ink-muted">Weigh-ins, training volume and consistency.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Weight chart */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Body weight</h2>
            {weightTrendKg != null && (
              <Badge tone={weightTrendKg <= 0 ? "success" : "warning"}>
                {weightTrendKg <= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {weightTrendKg > 0 ? "+" : ""}{weightTrendKg} kg / 4 wks
              </Badge>
            )}
          </div>
          {weightEntries.length >= 2 && weightChart.length >= 1 ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChart} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 12 }}
                    labelStyle={{ color: "var(--color-ink-muted)" }}
                    itemStyle={{ color: "var(--color-accent-300)" }}
                  />
                  <Line type="monotone" dataKey="kg" stroke="var(--color-accent)" strokeWidth={2} isAnimationActive={false} dot={{ r: 2.5, fill: "var(--color-accent)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-ink-faint">
              Log at least two weigh-ins to see your trend line.
            </p>
          )}

          {/* weigh-in form */}
          <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <div className="w-32">
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Today's weight (kg)</label>
              <Input type="number" step="0.1" min="25" max="400" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="80.5" />
            </div>
            <div className="min-w-40 flex-1">
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Morning, fasted…" />
            </div>
            <Button type="submit" loading={busy}>{existingToday ? "Update" : "Log weight"}</Button>
          </form>
          {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
          {saved && <p className="mt-2 text-[13px] text-success">Weigh-in saved.</p>}
        </Card>

        {/* Side stats */}
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Goal progress</h2>
            <p className="mt-3 display text-3xl font-bold tnum">{weightProgress}%</p>
            <p className="text-[13px] text-ink-muted">
              {profile?.start_weight_kg ?? "—"} kg → {profile?.target_weight_kg ?? "—"} kg
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Streaks</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="display text-xl font-bold tnum text-data-amber">{profile?.streak_count ?? 0}</p>
                <p className="text-[12px] text-ink-muted">current</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="display text-xl font-bold tnum">{profile?.best_streak ?? 0}</p>
                <p className="text-[12px] text-ink-muted">best</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-8 gap-1">
              {streakDays.map((d) => (
                <div
                  key={d.key}
                  title={d.key}
                  className={`aspect-square rounded-[3px] ${d.active ? "bg-accent" : "bg-surface-2"}`}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Weigh-in history */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Weigh-in history</h2>
          <span className="text-[13px] text-ink-muted">{weightEntries.length} entries</span>
        </div>
        {weightEntries.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-faint">
            No weigh-ins yet — log your first above and it will appear here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {weightEntries.slice(0, 30).map((w) => (
              <li key={w.id} className="py-2.5">
                {editingId === w.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number" step="0.1" min="25" max="400"
                      value={editKg}
                      onChange={(e) => setEditKg(e.target.value)}
                      className="w-24"
                      aria-label="Weight in kilograms"
                    />
                    <Input
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="min-w-40 flex-1"
                    />
                    <Button
                      size="sm" loading={editBusy} disabled={editBusy}
                      onClick={async () => {
                        const kg = Number(editKg);
                        if (!kg || kg < 25 || kg > 400) return setError("Weight must be 25–400 kg.");
                        setEditBusy(true);
                        const { error } = await updateWeight(w.id, kg, editNote.trim() || null);
                        setEditBusy(false);
                        if (error) setError(error);
                        else setEditingId(null);
                      }}
                    >
                      <Check className="h-4 w-4" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-ink">
                        {fmtDate(w.entry_date)}
                        <span className="ml-2 tnum">{w.weight_kg} kg</span>
                      </p>
                      {w.note && <p className="truncate text-[12px] text-ink-faint">{w.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => { setEditingId(w.id); setEditKg(String(w.weight_kg)); setEditNote(w.note ?? ""); setError(null); }}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                        aria-label={`Edit weigh-in from ${fmtDate(w.entry_date)}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Delete the ${fmtDate(w.entry_date)} weigh-in (${w.weight_kg} kg)?`)) {
                            await deleteWeight(w.id);
                          }
                        }}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger"
                        aria-label={`Delete weigh-in from ${fmtDate(w.entry_date)}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Volume chart */}
      <Card>
        <h2 className="font-semibold">Weekly training volume (kg)</h2>
        {sessions.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-faint">Complete workouts to see volume per week.</p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeChart} margin={{ top: 5, right: 10, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-2)" }}
                  contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 12 }}
                  labelStyle={{ color: "var(--color-ink-muted)" }}
                  itemStyle={{ color: "var(--color-accent-300)" }}
                />
                <Bar dataKey="volume" fill="var(--color-accent)" isAnimationActive={false} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
