import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarCheck,
  ChefHat,
  Dumbbell,
  Flame,
  MessageCircle,
  ScanLine,
  Trophy,
  User as UserIcon,
  Zap,
} from "lucide-react";
import { cn, formatNumber } from "../lib/utils";
import { rankForXp } from "../lib/gamification";
import { useProfile } from "../context/ProfileContext";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";

const NAV = [
  { to: "/app", label: "Dashboard", icon: Activity, end: true },
  { to: "/app/nutrition", label: "Nutrition", icon: ChefHat },
  { to: "/app/scan", label: "Scan", icon: ScanLine },
  { to: "/app/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/app/progress", label: "Progress", icon: CalendarCheck },
  { to: "/app/coach", label: "AI Coach", icon: MessageCircle },
  { to: "/app/achievements", label: "Achievements", icon: Trophy },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
];

/** Desktop side navigation item. */
function SideItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Activity; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("h-[18px] w-[18px]", isActive && "text-accent-300")} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Mobile bottom-nav item (compact, icon-over-label). */
function BottomItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Activity; end?: boolean }) {
  const primary = ["/app", "/app/nutrition", "/app/workouts", "/app/coach", "/app/profile"];
  if (!primary.includes(to)) return null;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-1 px-3 py-2 text-[10px] font-medium",
          isActive ? "text-accent-300" : "text-ink-faint"
        )
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const rank = rankForXp(profile?.xp ?? 0);

  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface-1/60 backdrop-blur lg:flex">
        <button className="cursor-pointer px-5 pt-6 pb-4 text-left" onClick={() => navigate("/app")}>
          <Logo />
        </button>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => (
            <SideItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <button
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-surface-2"
            onClick={() => navigate("/app/profile")}
          >
            <Avatar
              avatarId={profile?.avatar_url}
              name={profile?.display_name}
              className="h-10 w-10 text-lg"
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{profile?.display_name ?? "Member"}</p>
              <p className="text-[12px] text-ink-faint">{rank.current.name}</p>
            </div>
          </button>
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            <Flame className="h-4 w-4 text-data-amber" />
            <span className="font-semibold text-ink">{profile?.streak_count ?? 0}</span>
            <span className="text-ink-faint">day streak</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            <Zap className="h-4 w-4 text-accent-300" />
            <span className="font-semibold text-ink tnum">{formatNumber(profile?.xp ?? 0)}</span>
            <span className="text-ink-faint">XP · {rank.current.name}</span>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="theme-glass fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Logo compact />
        <button className="flex cursor-pointer items-center gap-3 text-[13px]" onClick={() => navigate("/app/profile")}>
          <span className="flex items-center gap-1 font-semibold">
            <Flame className="h-4 w-4 text-data-amber" />
            {profile?.streak_count ?? 0}
          </span>
          <span className="flex items-center gap-1 font-semibold tnum">
            <Zap className="h-4 w-4 text-accent-300" />
            {formatNumber(profile?.xp ?? 0)}
          </span>
          <Avatar
            avatarId={profile?.avatar_url}
            name={profile?.display_name}
            className="h-9 w-9 rounded-full text-base"
          />
        </button>
      </header>

      {/* Content */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-20 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-surface-0/95 pt-1 pb-[max(env(safe-area-inset-bottom),4px)] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <BottomItem key={item.to} {...item} />
        ))}
        <BottomItem to="/app/scan" label="Scan" icon={ScanLine} />
      </nav>
    </div>
  );
}
