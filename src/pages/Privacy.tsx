import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { SUPPORT_EMAIL } from "../lib/contact";

const sections: { h: string; p: string[]; list?: string[] }[] = [
  {
    h: "1. Data we collect",
    p: ["We collect only what the app needs to work:"],
    list: [
      "Account data: email address, display name, and password (stored securely by our auth provider — we never see your plain-text password).",
      "Profile data: age, gender, height, goals, experience level, dietary preferences.",
      "Health & fitness data you log: body weight entries, food entries (meals, calories, macros), workouts, workout sessions, streaks, XP and achievements.",
      "AI interactions: your coach messages and food-scan photos, kept so your history works.",
      "Technical data: basic device/app diagnostics needed for security and reliability.",
    ],
  },
  {
    h: "2. How we use your data",
    p: [
      "Your data is used to run the app: showing your dashboard, progress charts, streaks, and personalizing AI coach replies with your own numbers.",
      "We do not sell your data. We do not share it with advertisers. We do not transfer it to data brokers.",
      "The only third parties that ever process your data are the ones required to run the service: our database host (Supabase, section 4) and the AI providers that power the coach and food scanner (section 3).",
    ],
  },
  {
    h: "3. AI providers",
    p: [
      "The AI coach and food scanner are powered by third-party AI providers (currently Google Gemini, with OpenRouter as fallback). When you use these features, your question — plus relevant context from your profile such as your goal and recent logs, or the food photo you submit — is sent to the provider to generate a reply.",
      "We send the minimum context needed for a useful answer. Providers process this data under their own terms; we do not use your health data to train models.",
    ],
  },
  {
    h: "4. Where your data is stored",
    p: [
      "Data is stored in our secure cloud database (Supabase) with row-level security: each member can only ever read and write their own records. Access is encrypted in transit (HTTPS) and at rest.",
    ],
  },
  {
    h: "5. How long we keep it",
    p: [
      "We keep your data while your account is active. If you delete your account, your profile and all logged data are permanently deleted.",
    ],
  },
  {
    h: "6. Your rights",
    p: ["You can at any time:"],
    list: [
      "View and edit your profile and logged data in the app.",
      "Delete individual entries (weigh-ins, food logs, workouts).",
      "Delete your entire account and data from profile settings or by contacting us.",
      "Ask us what data we hold about you and request a copy.",
    ],
  },
  {
    h: "7. Children",
    p: [
      "The app is not intended for children under 13 (or the minimum age in your country). We do not knowingly collect data from children.",
    ],
  },
  {
    h: "8. Changes to this policy",
    p: [
      "If we change this policy, we will update the date above and, for significant changes, notify you in the app.",
    ],
  },
  {
    h: "9. Contact",
    p: [
      SUPPORT_EMAIL
        ? `Privacy questions or data requests: email us at ${SUPPORT_EMAIL}.`
        : "Privacy questions or data requests: use the contact details in the app's profile section.",
    ],
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-surface-0">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" aria-label="GymAI Coach home"><Logo /></Link>
          <Link to="/auth" className="text-sm font-medium text-accent-300 hover:underline">Back to the app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="display text-3xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated: September 2026</p>
        <p className="mt-4 rounded-xl border border-line bg-surface-1 px-4 py-3 text-[15px] text-ink">
          Short version: your data is yours. We store it securely, never sell it,
          and you can delete it any time.
        </p>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="display text-lg font-semibold text-ink">{s.h}</h2>
              {s.p.map((para, i) => (
                <p key={i} className="mt-2 text-[15px] leading-relaxed text-ink-muted">{para}</p>
              ))}
              {s.list && (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
                  {s.list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-faint">
          Related: <Link to="/terms" className="text-accent-300 hover:underline">Terms of Service</Link>
        </p>
      </main>
    </div>
  );
}
