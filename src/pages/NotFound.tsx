import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-0 px-6 text-center">
      <Logo />
      <div>
        <p className="display text-6xl font-bold text-ink">404</p>
        <p className="mt-2 text-ink-muted">This page skipped leg day and disappeared.</p>
      </div>
      <Link to="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
