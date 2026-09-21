import { Component, type ReactNode } from "react";

interface Props {
  /** Rendered instead of the scene whenever it throws or fails to load. */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Guards the WebGL hero: a context-creation failure, driver crash or chunk
 * load error must degrade to the static hero art — never unmount the tree
 * (React 19 unmounts on uncaught render errors, which reads as a black page).
 */
export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[hero] 3D scene unavailable, using static art:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
