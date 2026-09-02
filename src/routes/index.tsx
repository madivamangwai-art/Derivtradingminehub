import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  IdCard,
  KeyRound,
  ReceiptText,
  Signal,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const tradeCycles = [
  { label: "Signal trade", value: "30 min", detail: "fast cycle" },
  { label: "Locked copy", value: "7 days", detail: "daily profit" },
  { label: "Locked copy", value: "30 days", detail: "daily profit" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-slate-950 ring-1 ring-primary/40">
            <img src="/favicon.png" alt="MineHub" className="h-7 w-7 object-contain" />
          </div>
          <span className="text-lg font-bold tracking-tight">Deriv Trading MineHub</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-sm font-semibold"
          >
            Start <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main>
        <section className="border-y border-border/50 bg-card/35">
          <div className="mx-auto grid min-h-[calc(100vh-74px)] max-w-6xl content-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                <Signal className="h-3.5 w-3.5 text-primary" />
                Copy trading signals, KYC, wallet, and team income
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
                Trade from signal codes and earn when your team profits.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                The new MineHub flow is built around admin-managed copy trading analysts, manual
                signal codes, visible transactions, and 3% direct income from referred trade profit.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex items-center gap-2 rounded-xl gradient-gold px-6 py-3 text-sm font-semibold"
                >
                  Create account <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold"
                >
                  Open dashboard
                </Link>
              </div>
            </div>

            <div className="grid content-center gap-3">
              <div className="rounded-2xl border border-border bg-background p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Copy signal</div>
                    <div className="mt-1 text-2xl font-bold">MH-7194</div>
                  </div>
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    Active
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {tradeCycles.map((cycle) => (
                    <div
                      key={`${cycle.label}-${cycle.value}`}
                      className="rounded-xl bg-muted/45 p-3"
                    >
                      <div className="text-[11px] text-muted-foreground">{cycle.label}</div>
                      <div className="mt-1 font-bold">{cycle.value}</div>
                      <div className="text-[11px] text-muted-foreground">{cycle.detail}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-primary/10 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Expected profit</span>
                    <span className="font-bold text-success">15%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                    <div className="h-full w-2/3 rounded-full bg-primary" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Metric icon={Wallet} label="Wallet" value="Deposits + withdrawals" />
                <Metric icon={ReceiptText} label="Transactions" value="Trades, bonuses, income" />
                <Metric icon={Users} label="My Team" value="Trade count + earnings" />
                <Metric icon={IdCard} label="KYC" value="Secure document review" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3">
          <Feature
            icon={TrendingUp}
            title="Admin-controlled copy trading"
            body="Admins manage analyst names, profile photos, bios, return rates, active status, and signal codes from the control panel."
          />
          <Feature
            icon={KeyRound}
            title="Safer account access"
            body="Clients can change passwords in Settings, while admins can reset a client password back to the registered phone number."
          />
          <Feature
            icon={Coins}
            title="3% direct income"
            body="Referral income is paid from actual copy-trade profit, so your team page tracks trades, profit, and what you earned."
          />
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl items-center justify-between border-t border-border/40 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <span>Copyright {new Date().getFullYear()} MineHub</span>
        <span className="inline-flex items-center gap-1">
          <Zap className="h-3 w-3" /> Copy trading system
        </span>
      </footer>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-3 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{value}</div>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg gradient-gold">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> New system ready
      </div>
    </article>
  );
}
