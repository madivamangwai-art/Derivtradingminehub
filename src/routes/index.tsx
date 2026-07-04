import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, TrendingUp, Users, Wallet, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen gradient-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-gold">
            <Coins className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">MineHub</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/auth" search={{ mode: "signup" }} className="rounded-lg gradient-gold px-4 py-2 text-sm font-semibold">
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
          Now paying 70 KES daily from just 1,000 KES
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
          Turn idle cash into <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, oklch(0.86 0.14 85), oklch(0.68 0.18 55))" }}>daily mining rewards.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Pick a package, get paid every 24 hours for 30 days, and earn extra by inviting your friends.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/auth" search={{ mode: "signup" }} className="rounded-xl gradient-gold px-6 py-3 text-sm font-semibold">
            Start mining
          </Link>
          <Link to="/auth" className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold">
            I have an account
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: TrendingUp, title: "Daily payouts", body: "Earn every 24 hours, automatically credited to your wallet." },
            { icon: Users, title: "Referral bonus", body: "Get instant KES bonus whenever your invitee buys a package." },
            { icon: Shield, title: "M-Pesa deposits", body: "Top-up and withdraw straight from your Safaricom line." },
          ].map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6 text-left">
              <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-5">
          {[
            { n: "D1", t: "Bronze", p: 1000, d: 70 },
            { n: "D2", t: "Silver", p: 3000, d: 220 },
            { n: "D3", t: "Gold", p: 8000, d: 620 },
            { n: "D4", t: "Diamond", p: 20000, d: 1600 },
            { n: "D5", t: "Platinum", p: 50000, d: 4200 },
          ].map((pkg) => (
            <div key={pkg.n} className="glass-card rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">{pkg.n}</div>
              <div className="text-lg font-semibold">{pkg.t}</div>
              <div className="mt-2 text-2xl font-bold text-primary">KES {pkg.d}</div>
              <div className="text-xs text-muted-foreground">per day · 30d</div>
              <div className="mt-3 text-xs text-muted-foreground">Buy at KES {pkg.p.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl border-t border-border/40 px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MineHub · <Zap className="mx-1 inline h-3 w-3" /> Powered by Supabase + Vercel
      </footer>
    </div>
  );
}
