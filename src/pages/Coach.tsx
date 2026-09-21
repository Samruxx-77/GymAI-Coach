import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { Card, Button, Textarea } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useAuth } from "../context/AuthContext";
import { askCoach } from "../lib/aiClient";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { supabase } from "../lib/supabase";
import { recomputeXpCache } from "../lib/xp";
import { cn } from "../lib/utils";

const SUGGESTIONS = [
  "How's my progress looking this month?",
  "What should I eat after today's workout?",
  "My weight loss stalled — what now?",
  "Plan a 40-minute session for today",
  "How do I hit my protein target today?",
];

export default function Coach() {
  return <CoachInner />;
}

function CoachInner() {
  const { profile } = useProfile();
  const { today, last30Workouts, weightTrendKg } = useData();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  void user;

  /* load most recent conversation + messages */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || cancelled) { setLoadingHistory(false); return; }
      const { data: conv } = await supabase
        .from("ai_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (conv && conv.length) {
        setConversationId(conv[0].id);
        const { data: msgs } = await supabase
          .from("ai_messages")
          .select("*")
          .eq("conversation_id", conv[0].id)
          .order("created_at", { ascending: true });
        if (!cancelled && msgs) {
          setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
        }
      }
      if (!cancelled) setLoadingHistory(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const context = useMemo(
    () => ({
      name: profile?.display_name ?? undefined,
      goal: profile?.primary_goal ?? undefined,
      experienceLevel: profile?.experience_level ?? undefined,
      age: profile?.age ?? undefined,
      gender: profile?.gender ?? undefined,
      heightCm: profile?.height_cm ?? undefined,
      currentWeightKg: profile?.current_weight_kg ?? undefined,
      targetWeightKg: profile?.target_weight_kg ?? undefined,
      calorieTarget: profile?.calorie_target ?? undefined,
      proteinTarget: profile?.protein_target ?? undefined,
      weeklyWorkoutTarget: profile?.weekly_workout_target ?? undefined,
      streak: profile?.streak_count ?? 0,
      recentWorkouts: last30Workouts,
      todayCalories: today.calories,
      todayProtein: today.protein,
      weightTrend: weightTrendKg ?? undefined,
      dietaryPreferences: profile?.dietary_preferences ?? [],
    }),
    [profile, today, last30Workouts, weightTrendKg]
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setError(null);
      setInput("");
      setSending(true);
      const userMsg = { id: `tmp-${Date.now()}`, role: "user" as const, content };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);

      try {
        const { reply } = await askCoach(
          nextMessages.slice(-16).map((m) => ({ role: m.role, content: m.content })),
          context
        );
        const assistantMsg = { id: `tmp-a-${Date.now()}`, role: "assistant" as const, content: reply };
        setMessages((m) => [...m, assistantMsg]);

        // persist (best-effort)
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          let convId = conversationId;
          if (!convId) {
            const { data: conv } = await supabase
              .from("ai_conversations")
              .insert({ user_id: auth.user.id, title: content.slice(0, 60) })
              .select("id")
              .single();
            convId = conv?.id ?? null;
            if (convId) setConversationId(convId);
          }
          if (convId) {
            await supabase.from("ai_messages").insert([
              { conversation_id: convId, user_id: auth.user.id, role: "user", content },
              { conversation_id: convId, user_id: auth.user.id, role: "assistant", content: reply },
            ]);
            await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
          }
          // ai_chat XP: once per day via daily dedupe; keep the cached
          // total in sync like every other award path.
          await supabase
            .from("xp_events")
            .upsert(
              { user_id: auth.user.id, source: "ai_chat", ref_id: null, day: new Date().toISOString().slice(0, 10) },
              { onConflict: "user_id,source,day", ignoreDuplicates: true }
            );
          await recomputeXpCache(auth.user.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "The coach is unavailable right now.");
      } finally {
        setSending(false);
      }
    },
    [messages, sending, context, conversationId]
  );

  async function clearChat() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    if (conversationId) {
      await supabase.from("ai_conversations").delete().eq("id", conversationId);
    }
    setConversationId(null);
    setMessages([]);
  }

  return (
    <div className="page-fade flex flex-col" style={{ height: "calc(100vh - 11rem)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-2xl font-bold">AI Coach</h1>
          <p className="text-[13px] text-ink-muted">Knows your goal, targets, streak and recent training.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearChat} aria-label="Clear conversation">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* messages */}
      <Card className="mt-4 flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loadingHistory ? (
            <div className="skeleton h-24" />
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
                <MessageCircle className="h-6 w-6 text-accent-300" />
              </div>
              <p className="font-semibold text-ink">Ask your coach anything</p>
              <p className="max-w-xs text-[13px] text-ink-muted">
                Training, nutrition, plateaus, motivation — answers use your real numbers.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                    m.role === "user"
                      ? "whitespace-pre-wrap bg-accent text-white"
                      : "bg-surface-2 text-ink"
                  )}
                >
                  {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-surface-2 px-4 py-3">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-300 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-300 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-300 [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* suggestions */}
        {messages.length === 0 && !loadingHistory && (
          <div className="flex flex-wrap gap-2 border-t border-line p-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:border-accent hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* composer */}
        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
        >
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about training, food, or your progress…"
            className="max-h-32 min-h-10 flex-1"
          />
          <Button type="submit" size="md" loading={sending} disabled={!input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      {error && (
        <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>
      )}
    </div>
  );
}
