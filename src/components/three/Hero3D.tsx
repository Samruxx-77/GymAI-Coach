import { Suspense, lazy, useEffect, useState } from "react";
import { hasWebGL, prefersReducedMotion } from "../../lib/env";
import { SceneBoundary } from "./SceneBoundary";

const DumbbellScene = lazy(() => import("./DumbbellScene"));

/**
 * Static art shown when WebGL is missing, motion is reduced, the chunk fails
 * to load, or the scene throws — keeps the hero identical in silhouette.
 */
export function HeroArtFallback() {
  return (
    <div aria-hidden className="hero-fallback relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-[90px]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-40 w-40 text-accent-300 drop-shadow-[0_0_35px_rgba(124,92,255,0.55)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M6.5 6.5v11M17.5 6.5v11" />
          <path d="M3.5 8.5v7M20.5 8.5v7" />
          <path d="M1.5 10v4M22.5 10v4" />
          <path d="M6.5 12h11" />
        </svg>
      </div>
      <div className="hero-fallback-orb absolute right-[14%] top-[22%] h-2.5 w-2.5 rounded-full bg-accent-light" />
      <div className="hero-fallback-orb absolute left-[18%] bottom-[24%] h-2 w-2 rounded-full bg-accent-light/80" />
      <div className="hero-fallback-orb absolute left-[30%] top-[18%] h-1.5 w-1.5 rounded-full bg-data-blue/80" />
    </div>
  );
}

/**
 * Mounts the lazy WebGL scene only when the device can render it.
 * Server/jsdom/no-WebGL/reduced-motion → static fallback, zero risk.
 */
export default function Hero3D({ className }: { className?: string }) {
  const [mode, setMode] = useState<"probing" | "3d" | "static">("probing");

  useEffect(() => {
    if (prefersReducedMotion() || !hasWebGL()) {
      setMode("static");
      return;
    }
    const id = window.setTimeout(() => setMode("3d"), 400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={className}>
      {mode === "3d" ? (
        <SceneBoundary fallback={<HeroArtFallback />}>
          <Suspense fallback={<HeroArtFallback />}>
            <DumbbellScene />
          </Suspense>
        </SceneBoundary>
      ) : (
        <HeroArtFallback />
      )}
    </div>
  );
}
