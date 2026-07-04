import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Users, ArrowDownToLine, ArrowUpFromLine, Network, MessageSquare, Package, LogOut, Coins, Gift, Sparkles, Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const items = [
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/accounts", label: "Accounts", icon: Landmark },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { to: "/admin/redpackets", label: "Red Packets", icon: Gift },
  { to: "/admin/spins", label: "Spins", icon: Sparkles },
  { to: "/admin/teams", label: "Teams", icon: Network },
  { to: "/admin/support", label: "Support", icon: MessageSquare },
  { to: "/admin/packages", label: "Packages", icon: Package },
] as const;

export function AdminShell({ children, title }: { children: ReactNode; title: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar p-4 md:flex">
        <Link to="/admin/clients" className="mb-6 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg gradient-gold"><Coins className="h-4 w-4" /></div>
          <span className="text-base font-bold">MineHub · Admin</span>
        </Link>
        <nav className="flex-1 space-y-1">
          {items.map((i) => {
            const active = path === i.to || path.startsWith(i.to);
            return (
              <Link key={i.to} to={i.to} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                <i.icon className="h-4 w-4" /> {i.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <div className="flex-1 overflow-auto">
        <header className="border-b border-border/60 bg-background/90 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-4">
            <h1 className="text-xl font-semibold">{title}</h1>
            <Link to="/home" className="text-xs text-muted-foreground hover:text-foreground">← Client view</Link>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-border/40 px-4 py-2 md:hidden">
            {items.map((i) => (
              <Link key={i.to} to={i.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">{i.label}</Link>
            ))}
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
