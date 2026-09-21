/**
 * Typed client for the server-side AI routes (/api/ai/*).
 * Never touches provider keys — the server owns those.
 */
import { supabase } from "./supabase";

export interface CoachContext {
  name?: string;
  goal?: string;
  experienceLevel?: string;
  age?: number;
  gender?: string;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  calorieTarget?: number;
  proteinTarget?: number;
  weeklyWorkoutTarget?: number;
  streak?: number;
  recentWorkouts?: number;
  todayCalories?: number;
  todayProtein?: number;
  weightTrend?: number;
  dietaryPreferences?: string[];
}

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachResponse {
  reply: string;
  provider: string;
  fallbackUsed: boolean;
}

const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504]);

async function postJson<T>(url: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  let lastErr: unknown = null;
  // Free-tier models hiccup (rate limits, cold starts, slow reasoning) often
  // enough that one automatic retry smooths out most transient failures.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // The server verifies this token before spending AI quota.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error || `Request failed (${res.status})`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return data as T;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number } | null)?.status;
      const transient =
        (err instanceof DOMException && err.name === "AbortError") ||
        err instanceof TypeError || // network failure
        (typeof status === "number" && TRANSIENT_STATUSES.has(status));
      if (!transient || attempt === 1) break;
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastErr instanceof DOMException && lastErr.name === "AbortError") {
    throw new Error("The AI is taking too long to respond. Please try again.");
  }
  throw lastErr;
}

export function askCoach(messages: CoachMessage[], context: CoachContext): Promise<CoachResponse> {
  return postJson<CoachResponse>("/api/ai/coach", { messages, context });
}

export function scanFood(imageBase64: string): Promise<FoodScanResponse> {
  // Vision analysis is slow on free-tier models; allow 95s (just above
  // the server's 90s food budget so server errors surface first).
  return postJson<FoodScanResponse>("/api/ai/food", { imageBase64 }, 95_000);
}

export interface FoodScanResponse {
  name: string;
  servingEstimate: string;
  confidence: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number }[];
  sanity: "ok" | "uncertain";
  provider: string;
  fallbackUsed: boolean;
}/**
 * Downscale an image File to a JPEG and return base64 (no data: prefix).
 * Aggressive enough that phone photos upload fast (free-tier vision
 * models choke on multi-megabyte payloads), still plenty for food ID.
 * Escalates quality until the byte ceiling is met.
 */
export function fileToDownscaledBase64(file: File, maxDim = 640, maxBytes = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.85, 0.75, 0.6, 0.45]) {
        const dataUrl = canvas.toDataURL("image/jpeg", q);
        const b64 = dataUrl.split(",")[1] ?? "";
        if (b64.length <= maxBytes || q === 0.45) {
          resolve(b64);
          return;
        }
      }
      resolve("");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image file."));
    };
    img.src = objectUrl;
  });
}
