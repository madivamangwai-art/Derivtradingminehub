import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChartNoAxesCombined, CheckCircle2, Clock, LockKeyhole, Search, SlidersHorizontal } from "lucide-react";
import { applyCopyTrade, getCopyTradingData, type CopyTradeType } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/trade/mine")({ component: CopyTradingPage });

const fmt = (n: any) =>
  `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const analysts = [
  {
    name: "Carl Grindan",
    role: "Portfolio Manager",
    oneDay: "+4%",
    sevenDay: "+35%",
    color: "bg-sky-600",
    bio: "Carl focuses on momentum entries, strict position sizing, and short copy-trade cycles across technology leaders.",
  },
  {
    name: "Professor Jarvis",
    role: "Portfolio Manager",
    oneDay: "+2%",
    sevenDay: "+16%",
    color: "bg-zinc-700",
    bio: "Professor Jarvis tracks macro risk, liquidity shifts, and large-cap trend reversals before confirming a signal.",
  },
  {
    name: "Tom",
    role: "Portfolio Manager",
    oneDay: "+2%",
    sevenDay: "+14%",
    color: "bg-rose-700",
    bio: "Professor Tom holds a Ph.D. in Finance and researches market liquidity, options, credit risk, and fixed income pricing.",
  },
];

const tradeTypes: Array<{ value: CopyTradeType; label: string; term: string }> = [
  { value: "daily", label: "Daily", term: "30 min" },
  { value: "locked7", label: "Locked 7", term: "7 days" },
  { value: "locked30", label: "Locked 30", term: "30 days" },
];

function CopyTradingPage() {
  const qc = useQueryClient();
  const dataFn = useServerFn(getCopyTradingData);
  const applyFn = useServerFn(applyCopyTrade);
  const { data } = useQuery({ queryKey: ["copy-trading"], queryFn: () => dataFn() });
  const [selectedAnalyst, setSelectedAnalyst] = useState<(typeof analysts)[number] | null>(null);
  const [query, setQuery] = useState("");
  const [tradeType, setTradeType] = useState<CopyTradeType>("daily");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const selected = tradeTypes.find((item) => item.value === tradeType)!;
  const expectedProfit = Number(amount || 0) * Number(data?.profitRate ?? 0.016);
  const kycApproved = !!data?.kycApproved;
  const visibleAnalysts = analysts.filter((a) =>
    `${a.name} ${a.role}`.toLowerCase().includes(query.toLowerCase()),
  );

  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          code: code.trim().toUpperCase(),
          amount: Number(amount),
          trade_type: tradeType,
        },
      }),
    onSuccess: (result: any) => {
      if (result.ok) toast.success("Copy trade opened");
      else toast.error(result.message ?? "Signal did not match. Trade lost.");
      setCode("");
      setAmount("");
      setSelectedAnalyst(null);
      qc.invalidateQueries({ queryKey: ["copy-trading"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Copy trade failed"),
  });

  if (selectedAnalyst) {
    return (
      <div className="space-y-4">
        <section className="rounded-b-3xl bg-zinc-950 px-4 pb-8 pt-2 text-white">
          <button onClick={() => setSelectedAnalyst(null)} className="mb-6 flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft className="h-5 w-5" /> Select Analyst for Copy Trading
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-4xl font-bold">{selectedAnalyst.name}</h2>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-zinc-300">{selectedAnalyst.bio}</p>
            </div>
            <AnalystAvatar analyst={selectedAnalyst} size="lg" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <Info label="Follow Copy Trading Period" value={selected.term} />
            <Info label="Analyst Commission" value="0%" />
            <Info label="Minimum Copy Trading Amount" value="KES 1" />
            <Info label="Maximum Copy Trading Amount" value={fmt(data?.wallet?.balance)} />
          </div>
        </section>

        <section className="glass-card rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">Select Trading Product</h3>
            {kycApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" /> KYC approved
              </span>
            ) : (
              <span className="rounded-full bg-warning/20 px-2 py-1 text-xs text-foreground">KYC required</span>
            )}
          </div>
          {!kycApproved && (
            <div className="mb-4 rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs">
              Your KYC must be approved before you can apply to copy trading. Go to Settings to submit ID front, ID back, and selfie holding ID.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {tradeTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setTradeType(type.value)}
                className={`rounded-xl border px-2 py-3 text-center text-xs font-semibold ${
                  tradeType === type.value ? "border-foreground bg-foreground text-background" : "border-border bg-card"
                }`}
              >
                {type.label}
                <span className="mt-1 block text-[10px] opacity-70">{type.term}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Signal Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter signal code" />
            </div>
            <div>
              <Label>Copy Trading Amount</Label>
              <div className="flex gap-2">
                <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
                <Button type="button" variant="secondary" onClick={() => setAmount(String(Math.floor(Number(data?.wallet?.balance ?? 0))))}>
                  Max
                </Button>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Choose a voucher</span>
                <span>None</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Expected profit</span>
                <span className="font-semibold text-success">{fmt(expectedProfit)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-background">✓</span>
              I have read and agree Copy Trading Agreement
            </div>
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || !kycApproved || !code.trim() || Number(amount) <= 0}
              className="h-12 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {apply.isPending ? "Applying..." : "Apply to Copy Trading"}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-950 p-2 text-sm font-semibold text-zinc-400">
        <button className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3 text-white">
          <ChartNoAxesCombined className="h-4 w-4" /> P&L Details
        </button>
        <button className="py-3">My Copy Trading</button>
        <button className="py-3">Partner Details</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full bg-muted/70 pl-11" placeholder="Enter analyst name to search" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Follow Analyst</h2>
        <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
          <SlidersHorizontal className="h-4 w-4" /> signal
        </span>
      </div>

      {visibleAnalysts.map((analyst) => (
        <article key={analyst.name} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <AnalystAvatar analyst={analyst} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-bold">{analyst.name}</h3>
              <p className="text-sm font-semibold text-muted-foreground">{analyst.role}</p>
            </div>
            <Button onClick={() => setSelectedAnalyst(analyst)} className="rounded-full bg-foreground px-6 text-background hover:bg-foreground/90">
              Copy Trading
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Rate label="1-Day Return Rate" value={analyst.oneDay} />
            <Rate label="7-Day ROI" value={analyst.sevenDay} />
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold text-muted-foreground">Analyst Info</div>
            <button onClick={() => setSelectedAnalyst(analyst)} className="w-full truncate rounded-lg bg-muted px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
              {analyst.bio}
            </button>
          </div>
        </article>
      ))}

      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold">My Copy Trading</h2>
        {(data?.trades ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No copy trades yet.</div>
        ) : (
          <div className="space-y-2">
            {(data?.trades ?? []).map((trade: any) => (
              <div key={trade.id} className="rounded-xl bg-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold capitalize">{trade.trade_type.replace("locked", "locked ")}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${trade.status === "open" ? "bg-primary/15 text-primary" : trade.status === "won" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {trade.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Capital" value={fmt(trade.amount)} />
                  <MiniStat label="Profit paid" value={fmt(trade.total_profit_paid)} />
                  <MiniStat label={trade.status === "open" ? "Closes" : "Closed"} value={new Date(trade.closes_at).toLocaleDateString()} icon={trade.status === "open" ? Clock : LockKeyhole} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AnalystAvatar({ analyst, size = "sm" }: { analyst: (typeof analysts)[number]; size?: "sm" | "lg" }) {
  return (
    <div className={`grid shrink-0 place-items-center rounded-full ${analyst.color} text-white ${size === "lg" ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg"} font-black`}>
      {analyst.name.slice(0, 1)}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-success">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
