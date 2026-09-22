/**
 * Client capability probes. All are defensive so they behave in jsdom,
 * older browsers and embedded webviews without ever throwing.
 */

/** True when the user asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
