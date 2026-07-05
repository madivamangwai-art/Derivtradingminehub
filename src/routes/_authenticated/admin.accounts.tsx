import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetAccounts } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  ArrowDownToLine, ArrowUpFromLine, Sparkles, Wallet,
  Landmark, Percent, Users, TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/accounts")({ component: Page });

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Stat({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: any; label: string; value: string; hint?: string; tone?: "default"|"good"|"warn"|"bad";
}) {
  const toneCls = tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Page() {
  const fn = useServerFn(adminGetAccounts);
  const { data, isLoading } = useQuery({ queryKey: ["admin-accounts"], queryFn: () => fn() });

  if (isLoading || !data) {
    return <AdminShell title="Accounts"><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AdminShell>;
  }

  const runway = data.house.runwayDays;
  const coverage = data.house.coverageRatio;
  const houseTone: "good"|"warn"|"bad" = data.house.balance < 0 ? "bad" : (coverage !== null && coverage < 1 ? "warn" : "good");
  const runwayText = runway === null ? "No net outflow" : runway > 365 ? "> 1 year" : `${runway.toFixed(1)} days`;
  const coverageText = coverage === null ? "—" : `${(coverage * 100).toFixed(1)}%`;

  return (
    <AdminShell title="Accounts">
      <div className="space-y-6">
        {/* House summary */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">House</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat icon={Landmark} label="House balance" value={fmt(data.house.balance)}
              hint="Deposits + spin retained + fees − withdrawals paid" tone={houseTone} />
            <Stat icon={TrendingUp} label="Coverage ratio" value={coverageText}
              hint="House cash vs total client balances" tone={houseTone} />
            <Stat icon={Users} label="Client liability" value={fmt(data.totals.clientLiability)}
              hint={`Across ${data.totals.clientCount} clients`} />
            <Stat icon={Wallet} label="Runway" value={runwayText}
              hint="At current 30-day net outflow pace" tone={runway !== null && runway < 30 ? "warn" : "default"} />
          </div>
        </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Expected outflow</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Stat icon={ArrowUpFromLine} label="Daily expected" value={fmt(data.window30d?.expectedOutflow?.daily ?? data.expectedOutflow?.daily ?? 0)} />
              <Stat icon={ArrowUpFromLine} label="Weekly expected" value={fmt(data.expectedOutflow?.weekly ?? 0)} />
              <Stat icon={ArrowUpFromLine} label="Monthly expected" value={fmt(data.expectedOutflow?.monthly ?? 0)} />
            </div>
          </div>

        {/* Flows */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Cash flow (all-time)</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat icon={ArrowDownToLine} label="Total deposits" value={fmt(data.totals.totalDeposited)} tone="good" />
            <Stat icon={ArrowUpFromLine} label="Total withdrawn (gross)" value={fmt(data.totals.totalWithdrawn)} tone="bad" />
            <Stat icon={ArrowUpFromLine} label="Paid out to clients (net)" value={fmt(data.totals.paidOutNet)}
              hint="After 5% fee retained" />
            <Stat icon={Sparkles} label="Total earnings paid" value={fmt(data.totals.totalEarned)} />
          </div>
        </div>

        {/* Retained */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Retained by house</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat icon={Sparkles} label="Spin retained" value={fmt(data.spin.retained)}
              hint={`Spent ${fmt(data.spin.spent)} · Paid out ${fmt(data.spin.paidOut)}`} tone="good" />
            <Stat icon={Percent} label={`Withdrawal fees collected (${(data.fees.rate * 100).toFixed(0)}%)`}
              value={fmt(data.fees.collected)} tone="good" />
            <Stat icon={Percent} label="Fees pending" value={fmt(data.fees.pending)}
              hint="From withdrawals awaiting payout" />
          </div>
        </div>

        {/* 30-day window */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Last 30 days</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat icon={ArrowDownToLine} label="Deposits (30d)" value={fmt(data.window30d.deposits)} />
            <Stat icon={ArrowUpFromLine} label="Withdrawals (30d)" value={fmt(data.window30d.withdrawals)} />
            <Stat icon={TrendingUp} label="Avg daily deposit" value={fmt(data.window30d.avgDailyDeposit)} />
            <Stat icon={TrendingUp} label="Avg daily withdrawal" value={fmt(data.window30d.avgDailyWithdrawal)} />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">How to read this</div>
          <ul className="list-disc space-y-1 pl-4">
            <li><b>House balance</b> is the cash the house currently holds after paying out all completed withdrawals.</li>
            <li><b>Coverage ratio</b> above 100% means the house can cover every client balance right now. Below 100% is a red flag.</li>
            <li><b>Runway</b> estimates how long the house can sustain net outflow at the current 30-day pace.</li>
            <li>Every withdrawal retains 5% as tax/compliance — see the fees row.</li>
          </ul>
        </div>
      </div>
    </AdminShell>
  );
}
