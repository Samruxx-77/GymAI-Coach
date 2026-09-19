/**
 * Typed client for the server-side AI routes (/api/ai/*).
 * Never touches provider keys — the server owns those.
 */

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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("The AI is taking too long to respond. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function askCoach(messages: CoachMessage[], context: CoachContext): Promise<CoachResponse> {
  return postJson<CoachResponse>("/api/ai/coach", { messages, context });
}

export function scanFood(imageBase64: string): Promise<FoodScanResponse> {
  return postJson<FoodScanResponse>("/api/ai/food", { imageBase64 });
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
}

/**
 * Downscale an image File to a JPEG (max 768px) and return base64
 * (no data: prefix) — small enough for a fast serverless round-trip.
 */
export function fileToDownscaledBase64(file: File, maxDim = 768): Promise<string> {
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
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.split(",")[1] ?? "");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image file."));
    };
    img.src = objectUrl;
  });
}
