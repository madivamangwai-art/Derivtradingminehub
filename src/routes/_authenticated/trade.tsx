import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ClientShell } from "@/components/layout/client-shell";

export const Route = createFileRoute("/_authenticated/trade")({ component: TradeLayout });

const subs = [
  { to: "/trade/mine", label: "Mine" },
  { to: "/trade/redpacket", label: "Red Packet" },
  { to: "/trade/spin", label: "Spin" },
] as const;

function TradeLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <ClientShell title="Trade">
      <div className="mb-4 flex gap-2 rounded-xl bg-muted/40 p-1">
        {subs.map((s) => {
          const active = path === s.to || (path === "/trade" && s.to === "/trade/mine");
          return (
            <Link key={s.to} to={s.to} className={`flex-1 rounded-lg py-2 text-center text-xs font-medium transition ${active ? "bg-card text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </ClientShell>
  );
}
