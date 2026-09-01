import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetTreasury, adminUpdateTreasurySettings } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/admin-route";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Gauge,
  Landmark,
  Lock,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/treasury")({
  beforeLoad: requireAdminRoute,
  component: TreasuryPage,
});

const fmt = (n: any) =>
  `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function TreasuryPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetTreasury);
  const updateFn = useServerFn(adminUpdateTreasurySettings);
  const { data, isLoading } = useQuery({ queryKey: ["admin-treasury"], queryFn: () => getFn() });
  const update = useMutation({
    mutationFn: (payload: { withdrawals_frozen?: boolean; payouts_frozen?: boolean }) =>
      updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Treasury controls updated");
      qc.invalidateQueries({ queryKey: ["admin-treasury"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  if (isLoading || !data) {
    return (
      <AdminShell title="Treasury Runway & Liability Matrix">
        <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
      </AdminShell>
    );
  }

  const runway = data.summary.estimatedRunwayDays;
  const runwayText = runway === null ? "No daily drain" : `${Math.max(0, runway).toFixed(1)} days`;
  const health = data.liquidity.liquidityHealthIndex;
  const healthText = health === null ? "No outflow" : `${(health * 100).toFixed(1)}%`;
  const maxWall = Math.max(1, ...data.maturityWall.map((d: any) => Number(d.amount)));
  const critical = runway !== null && runway < 14;

  return (
    <AdminShell title="Treasury Runway & Liability Matrix">
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Summary
            icon={Landmark}
            label="Current Treasury Balance"
            value={fmt(data.summary.currentTreasuryBalance)}
            tone={data.summary.currentTreasuryBalance >= 0 ? "good" : "bad"}
          />
          <Summary
            icon={Gauge}
            label="Estimated Runway"
            value={runwayText}
            tone={critical ? "bad" : "good"}
          />
          <Summary
            icon={Lock}
            label="Total Active Principal"
            value={fmt(data.summary.totalActivePrincipal)}
          />
          <Summary
            icon={Users}
            label="Total Active Clients"
            value={String(data.summary.totalActiveClients)}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
          <div className="glass-card overflow-hidden rounded-2xl">
            <div className="border-b border-border/60 px-4 py-3">
              <div className="text-sm font-semibold">Liability Breakdown Matrix</div>
              <div className="text-[11px] text-muted-foreground">
                Daily cash obligations and near-term locked maturities
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/35 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Package Code</th>
                    <th className="px-4 py-3">Active Subscriptions</th>
                    <th className="px-4 py-3">Daily Payout Liability</th>
                    <th className="px-4 py-3">Maturing Locked Capital (Next 7 Days)</th>
                    <th className="px-4 py-3">Total Risk Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row: any) => (
                    <tr key={row.packageCode} className="border-t border-border/40">
                      <td className="px-4 py-3 font-semibold">
                        {row.packageCode}{" "}
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {row.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.activeSubscriptions}</td>
                      <td className="px-4 py-3">
                        {row.mode === "locked" ? "0.00 (Locked)" : fmt(row.dailyPayoutLiability)}
                      </td>
                      <td className="px-4 py-3">
                        {row.mode === "locked"
                          ? fmt(row.maturingLockedCapitalNext7)
                          : "N/A (Principal at Day 60)"}
                      </td>
                      <td className="px-4 py-3 font-semibold">{fmt(row.totalRiskExposure)}</td>
                    </tr>
                  ))}
                  {data.matrix.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        No active package liabilities.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> Liquidity Health Index
              </div>
              <div
                className={`mt-2 text-3xl font-bold ${health !== null && health < 1 ? "text-destructive" : "text-success"}`}
              >
                {healthText}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                <Mini label="Inflow" value={fmt(data.liquidity.todayDeposits)} />
                <Mini label="Payouts" value={fmt(data.liquidity.todayPayouts)} />
                <Mini label="Withdrawals" value={fmt(data.liquidity.todayWithdrawals)} />
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" /> Emergency Circuit Breaker
              </div>
              <div className="mt-3 grid gap-2">
                <Button
                  variant={data.settings.withdrawals_frozen ? "destructive" : "secondary"}
                  onClick={() =>
                    update.mutate({ withdrawals_frozen: !data.settings.withdrawals_frozen })
                  }
                  disabled={update.isPending}
                >
                  {data.settings.withdrawals_frozen
                    ? "Manual Withdrawals Frozen"
                    : "Freeze Manual Withdrawals"}
                </Button>
                <Button
                  variant={data.settings.payouts_frozen ? "destructive" : "secondary"}
                  onClick={() => update.mutate({ payouts_frozen: !data.settings.payouts_frozen })}
                  disabled={update.isPending}
                >
                  {data.settings.payouts_frozen ? "Cron Payouts Frozen" : "Freeze Cron Payouts"}
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Use when runway drops below 14 days or liquidity health stays under 100%.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
          <div className="glass-card rounded-2xl p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Maturity Wall Calendar
            </div>
            <div className="space-y-3">
              {data.maturityWall.map((day: any) => (
                <div
                  key={day.date}
                  className="grid grid-cols-[92px_1fr_120px] items-center gap-3 text-xs"
                >
                  <div className="text-muted-foreground">
                    {new Date(`${day.date}T00:00:00`).toLocaleDateString()}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(4, (Number(day.amount) / maxWall) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right font-semibold">{fmt(day.amount)}</div>
                </div>
              ))}
              {data.maturityWall.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No maturities in the next 30 days.
                </div>
              )}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="mb-3 text-sm font-semibold">Referral Liability Ledger</div>
            <div className="grid gap-2">
              <Mini
                icon={ArrowDownToLine}
                label="Recorded referral liability"
                value={fmt(data.referralLedger.recordedLiability)}
              />
              <Mini
                icon={ArrowUpFromLine}
                label="Pending referral liability"
                value={fmt(data.referralLedger.pendingLiability)}
              />
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Mini({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/35 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
