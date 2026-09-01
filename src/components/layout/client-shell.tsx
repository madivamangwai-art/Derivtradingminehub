import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BarChart3, ChartNoAxesCombined, Home, User, LogOut, Sun, Moon, CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTheme } from "@/lib/theme";
import { getMyProfile } from "@/lib/app.functions";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/trade/market", label: "Market", icon: ChartNoAxesCombined },
  { to: "/trade/mine", label: "Copy Trading", icon: BarChart3 },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/my", label: "My Account", icon: User },
] as const;

export function ClientShell({ children, title, onLogoClick }: { children: ReactNode; title?: string; onLogoClick?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const profileFn = useServerFn(getMyProfile);
  const { data: profileData } = useQuery({
    queryKey: ["profile-shell"],
    queryFn: () => profileFn(),
    staleTime: 60000,
  });
  const profile = profileData?.profile;
  const kycStatus = profileData?.kyc?.status ?? "unverified";

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/settings"
              className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-card"
              aria-label="Profile and KYC settings"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className={`absolute bottom-0 right-0 rounded-full border border-background ${
                  kycStatus === "approved"
                    ? "bg-success text-success-foreground"
                    : "bg-warning text-foreground"
                }`}
              >
                {kycStatus === "approved" ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
              </span>
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">{title ?? "Deriv Trading MineHub"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onLogoClick}
              aria-label="Deriv Trading MineHub"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-slate-900 ring-1 ring-primary/40"
            >
                <img
                  src="/favicon.png"
                  alt="MineHub"
                  className="h-7 w-7 object-contain"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    img.onerror = null;
                    img.src = "/favicon.png";
                  }}
                />
            </button>
            <button onClick={toggle} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={signOut} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const active = path === t.to || path.startsWith(t.to + "/");
            return (
              <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-1 py-3 text-xs transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                <t.icon className={`h-5 w-5 ${active ? "scale-110" : ""}`} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
