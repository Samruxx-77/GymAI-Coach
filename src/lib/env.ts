/**
 * Client capability probes. All are defensive so they behave in jsdom,
 * older browsers and embedded webviews without ever throwing.
 */

/** True if the browser can create a WebGL (2 preferred) rendering context. */
export function hasWebGL(): boolean {
  try {
    if (typeof window === "undefined") return false;
    // jsdom and very old browsers never define the WebGL globals — skip the
    // canvas probe entirely there so we never trip "not implemented" paths.
    if (typeof window.WebGLRenderingContext === "undefined") return false;
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** True when the user asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
