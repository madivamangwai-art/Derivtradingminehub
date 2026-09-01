import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getMyProfile } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Users,
  Wallet as WalletIcon,
  Sparkles,
  Settings,
  ReceiptText,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

const fmt = (n: number | string) =>
  `KES ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function HomePage() {
  const fn = useServerFn(getDashboard);
  const profFn = useServerFn(getMyProfile);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
  const { data: prof } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const wallet = data?.wallet;
  const activeCount = data?.activeTrades.length ?? 0;
  const activeCapital = (data?.activeTrades ?? []).reduce(
    (s, trade: any) => s + Number(trade.amount ?? 0),
    0,
  );
  const isAdmin = prof?.isAdmin ?? false;

  const handleLogoClick = isAdmin ? () => navigate({ to: "/admin/clients" }) : undefined;

  return (
    <ClientShell
      title={`Hi, ${data?.profile?.full_name?.split(" ")[0] ?? "Trader"}`}
      onLogoClick={handleLogoClick}
    >
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
          <span>Wallet balance</span>
          <span>KES</span>
        </div>
        <div className="mt-1 text-4xl font-bold">
          {isLoading ? "..." : fmt(wallet?.balance ?? 0)}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>Earned: {fmt(wallet?.total_earned ?? 0)}</span>
          <span>Deposited: {fmt(wallet?.total_deposited ?? 0)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => navigate({ to: "/wallet" })}
            className="flex items-center justify-center gap-2 rounded-xl gradient-gold py-3 text-sm font-semibold"
          >
            <ArrowDownToLine className="h-4 w-4" /> Deposit
          </button>
          <button
            onClick={() => navigate({ to: "/wallet" })}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold"
          >
            <ArrowUpFromLine className="h-4 w-4" /> Withdraw
          </button>
          <button
            onClick={() => navigate({ to: "/transactions" })}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold"
          >
            <ReceiptText className="h-4 w-4" /> Transactions
          </button>
          <button
            onClick={() => navigate({ to: "/settings" })}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold"
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard icon={Sparkles} label="Open trades" value={String(activeCount)} />
        <StatCard icon={TrendingUp} label="Capital" value={fmt(activeCapital)} />
        <StatCard icon={Users} label="Referrals" value={String(data?.referralCount ?? 0)} />
      </div>

      <Section
        title="Active copy trades"
        action={
          <Link to="/trade/mine" className="text-xs text-primary">
            Copy trade
          </Link>
        }
      >
        {(data?.activeTrades ?? []).length === 0 ? (
          <EmptyState
            title="No open copy trades"
            body="Use a valid signal code to start a copy trade."
            action={
              <Link
                to="/trade/mine"
                className="rounded-lg gradient-gold px-4 py-2 text-xs font-semibold"
              >
                Open Copy Trading
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {(data?.activeTrades ?? []).map((trade: any) => {
              const minutesLeft = Math.max(
                0,
                Math.ceil((new Date(trade.closes_at).getTime() - Date.now()) / 60000),
              );
              return (
                <div key={trade.id} className="glass-card w-full rounded-xl p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold capitalize">
                      {String(trade.trade_type).replace("locked", "locked ")}
                    </div>
                    <div className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                      {minutesLeft < 1440 ? `${minutesLeft}m left` : `${Math.ceil(minutesLeft / 1440)}d left`}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Capital: {fmt(trade.amount)} - Profit paid: {fmt(trade.total_profit_paid)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Recent activity">
        {(data?.recentTransactions ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No activity yet.
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.recentTransactions ?? []).map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{t.description ?? t.kind}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
                <div className={Number(t.amount) >= 0 ? "text-success" : "text-destructive"}>
                  {Number(t.amount) >= 0 ? "+" : ""}
                  {fmt(t.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </ClientShell>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-2 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}
function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <WalletIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-semibold">{title}</div>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
