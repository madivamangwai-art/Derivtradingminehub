import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getMyProfile, claimPackagePayout } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Users,
  Wallet as WalletIcon,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

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
  const activeCount = data?.activePackages.length ?? 0;
  const dailyTotal = (data?.activePackages ?? []).reduce(
    (s, p: any) => s + Number(p.packages?.daily_payout ?? 0),
    0,
  );
  const isAdmin = prof?.isAdmin ?? false;

  const [selectedPkg, setSelectedPkg] = useState<any>(null);

  const handleLogoClick = isAdmin ? () => navigate({ to: "/admin/clients" }) : undefined;

  return (
    <ClientShell
      title={`Hi, ${data?.profile?.full_name?.split(" ")[0] ?? "Miner"}`}
      onLogoClick={handleLogoClick}
    >
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
          <span>Wallet balance</span>
          <span>KES</span>
        </div>
        <div className="mt-1 text-4xl font-bold">{isLoading ? "…" : fmt(wallet?.balance ?? 0)}</div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>Earned: {fmt(wallet?.total_earned ?? 0)}</span>
          <span>Deposited: {fmt(wallet?.total_deposited ?? 0)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
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
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard icon={Sparkles} label="Active pkgs" value={String(activeCount)} />
        <StatCard icon={TrendingUp} label="Daily" value={fmt(dailyTotal)} />
        <StatCard icon={Users} label="Referrals" value={String(data?.referralCount ?? 0)} />
      </div>

      <Section
        title="Active packages"
        action={
          <Link to="/trade/mine" className="text-xs text-primary">
            Buy more
          </Link>
        }
      >
        {(data?.activePackages ?? []).length === 0 ? (
          <EmptyState
            title="No active packages"
            body="Head to Trade to buy your first mining package."
            action={
              <Link
                to="/trade/mine"
                className="rounded-lg gradient-gold px-4 py-2 text-xs font-semibold"
              >
                Browse packages
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {(data?.activePackages ?? []).map((p: any) => {
              const daysLeft = Math.max(
                0,
                Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / 86400000),
              );
              const pending = p.pending ?? { amount: 0, days: 0, nextBoundaryIso: null };
              const canClaim = pending.amount > 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPkg(p)}
                  className="glass-card w-full rounded-xl p-4 text-left transition hover:ring-2 hover:ring-primary/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{p.packages?.name}</div>
                    <div
                      className={`rounded-full px-2 py-0.5 text-xs ${canClaim ? "bg-success/20 text-success" : "bg-primary/15 text-primary"}`}
                    >
                      {canClaim ? `Claim ${fmt(pending.amount)}` : `${daysLeft}d left`}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Paid out: {fmt(p.total_paid_out)} · Daily {fmt(p.packages?.daily_payout)}
                  </div>
                  {pending.days > 0 && (
                    <div className="mt-1 text-[11px] text-success">
                      {pending.days} day{pending.days > 1 ? "s" : ""} ready · tap to claim
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <PackageClaimDialog pkg={selectedPkg} onClose={() => setSelectedPkg(null)} />

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

function PackageClaimDialog({ pkg, onClose }: { pkg: any; onClose: () => void }) {
  const claimFn = useServerFn(claimPackagePayout);
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { user_package_id: pkg.id } }),
    onSuccess: (r: any) => {
      toast.success(`Claimed ${fmt(r.amount)} to your wallet`);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Cannot claim yet"),
  });
  if (!pkg) return null;
  const pending = pkg.pending ?? { amount: 0, days: 0, nextBoundaryIso: null };
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(pkg.expires_at).getTime() - Date.now()) / 86400000),
  );
  const nextAt = pending.nextBoundaryIso ? new Date(pending.nextBoundaryIso) : null;
  return (
    <Dialog open={!!pkg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pkg.packages?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Daily payout</div>
              <div className="font-semibold">{fmt(pkg.packages?.daily_payout)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Days remaining</div>
              <div className="font-semibold">{daysLeft}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Total paid out</div>
              <div className="font-semibold">{fmt(pkg.total_paid_out)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Expires</div>
              <div className="font-semibold text-xs">
                {new Date(pkg.expires_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className={`rounded-xl p-4 ${pending.amount > 0 ? "bg-success/15" : "bg-muted/30"}`}>
            <div className="text-xs uppercase text-muted-foreground">Ready to claim</div>
            <div className="text-2xl font-bold">{fmt(pending.amount)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {pending.days > 0
                ? `${pending.days} day${pending.days > 1 ? "s" : ""} accumulated. Unclaimed payouts keep piling up.`
                : nextAt
                  ? `Next payout unlocks ${nextAt.toLocaleString()}`
                  : "Payouts unlock daily at 01:00."}
            </div>
          </div>
          <Button
            onClick={() => claim.mutate()}
            disabled={claim.isPending || pending.amount <= 0}
            className="w-full gradient-gold"
          >
            {claim.isPending
              ? "Claiming…"
              : pending.amount > 0
                ? `Claim ${fmt(pending.amount)}`
                : "Nothing to claim yet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
