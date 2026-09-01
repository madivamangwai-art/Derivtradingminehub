import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClientShell } from "@/components/layout/client-shell";

export const Route = createFileRoute("/_authenticated/trade")({ component: TradeLayout });

function TradeLayout() {
  return (
    <ClientShell title="Trading">
      <Outlet />
    </ClientShell>
  );
}
