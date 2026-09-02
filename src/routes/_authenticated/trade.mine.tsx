import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  LockKeyhole,
  Search,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { applyCopyTrade, getCopyTradingData, type CopyTradeType } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/trade/mine")({
  component: CopyTradingPage,
});

const fmt = (n: any) =>
  `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const fallbackAnalysts = [
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
    bio: "Professor Tom researches market liquidity, options, credit risk, and fixed income pricing.",
  },
];

const tradeTypes: Array<{ value: CopyTradeType; label: string; term: string }> = [
  { value: "daily", label: "Signal", term: "30 min" },
  { value: "locked7", label: "Locked 7", term: "7 days" },
  { value: "locked30", label: "Locked 30", term: "30 days" },
];

function CopyTradingPage() {
  const qc = useQueryClient();
  const dataFn = useServerFn(getCopyTradingData);
  const applyFn = useServerFn(applyCopyTrade);
  const { data } = useQuery({ queryKey: ["copy-trading"], queryFn: () => dataFn() });
  const analysts = (data?.analysts?.length ? data.analysts : fallbackAnalysts).map(
    (analyst: any, index: number) => ({
      name: analyst.name,
      id: analyst.id,
      role: analyst.title ?? analyst.role ?? "Portfolio Manager",
      oneDay: analyst.oneDay ?? `+${Number(analyst.one_day_return_rate ?? 0.02) * 100}%`,
      sevenDay: analyst.sevenDay ?? `+${Number(analyst.seven_day_roi ?? 0.14) * 100}%`,
      color: ["bg-sky-600", "bg-zinc-700", "bg-rose-700", "bg-emerald-700"][index % 4],
      avatar_url: analyst.avatar_url,
      bio: analyst.bio,
      min_copy_amount: analyst.min_copy_amount,
      max_copy_amount: analyst.max_copy_amount,
      commission_rate: analyst.commission_rate,
      source: "analyst" as const,
    }),
  );
  const manualSignal = {
    name: "Signal Trading",
    role: "Manual Code",
    oneDay: "+15%",
    sevenDay: "+105%",
    color: "bg-foreground",
    avatar_url: "",
    bio: "Enter a signal code from the admin signal desk and choose your copy trading cycle.",
    min_copy_amount: 1,
    max_copy_amount: null,
    commission_rate: 0,
    source: "signal" as const,
  };
  const [selectedAnalyst, setSelectedAnalyst] = useState<any | null>(null);
  const [view, setView] = useState<"analysts" | "my" | "partners">("analysts");
  const [query, setQuery] = useState("");
  const [tradeType, setTradeType] = useState<CopyTradeType>("daily");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [tradeWarning, setTradeWarning] = useState("");
  const selected = tradeTypes.find((item) => item.value === tradeType)!;
  const isSignalTrade = selectedAnalyst?.source === "signal";
  const selectedMinAmount = Number(selectedAnalyst?.min_copy_amount ?? 1);
  const selectedMaxAmount = Number(selectedAnalyst?.max_copy_amount ?? 0);
  const expectedProfit = Number(amount || 0) * Number(data?.profitRate ?? 0.15);
  const kycApproved = !!data?.kycApproved;
  const amountBelowMinimum = Number(amount || 0) > 0 && Number(amount) < selectedMinAmount;
  const amountAboveMaximum =
    selectedMaxAmount > 0 && Number(amount || 0) > 0 && Number(amount) > selectedMaxAmount;
  const visibleAnalysts = analysts.filter((a: any) =>
    `${a.name} ${a.role}`.toLowerCase().includes(query.toLowerCase()),
  );

  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          code: code.trim().toUpperCase(),
          amount: Number(amount),
          trade_type: tradeType,
          source: selectedAnalyst?.source ?? "signal",
          analyst_id: selectedAnalyst?.source === "analyst" ? selectedAnalyst.id : undefined,
        },
      }),
    onSuccess: (result: any) => {
      if (result.ok) toast.success(result.message ?? "Copy trade opened");
      else toast.error(result.message ?? "Signal did not match. Trade lost.");
      setTradeWarning("");
      setCode("");
      setAmount("");
      setSelectedAnalyst(null);
      qc.invalidateQueries({ queryKey: ["copy-trading"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => {
      const message = e.message ?? "Copy trade failed";
      setTradeWarning(message);
      toast.error(message);
    },
  });

  if (selectedAnalyst) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setSelectedAnalyst(null);
            setTradeWarning("");
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <section className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <AnalystAvatar analyst={selectedAnalyst} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {selectedAnalyst.role}
              </div>
              <h2 className="mt-1 truncate text-2xl font-bold">{selectedAnalyst.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedAnalyst.bio}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Info label="Period" value={selected.term} />
            <Info label="Commission" value="0%" />
            <Info label="Minimum" value={fmt(selectedMinAmount)} />
            <Info label="Wallet" value={fmt(data?.wallet?.balance)} />
          </div>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Open copy trade</h3>
            {kycApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3 w-3" /> KYC approved
              </span>
            ) : (
              <span className="rounded-full bg-warning/20 px-2 py-1 text-xs font-semibold text-foreground">
                KYC required
              </span>
            )}
          </div>
          {!kycApproved && (
            <div className="mb-4 rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs leading-5">
              Your KYC must be approved before you can apply to copy trading. Go to Settings to
              submit ID front, ID back, and selfie holding ID.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {tradeTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setTradeType(type.value)}
                className={`rounded-xl border px-2 py-3 text-center text-xs font-semibold transition ${
                  tradeType === type.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                {type.label}
                <span className="mt-1 block text-[10px] opacity-75">{type.term}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {isSignalTrade && (
              <div>
                <Label>Signal code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter signal code"
                />
              </div>
            )}
            <div>
              <Label>Copy trading amount</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={selectedMinAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAmount(String(Math.floor(Number(data?.wallet?.balance ?? 0))))}
                >
                  Max
                </Button>
              </div>
            </div>
            {amountBelowMinimum && (
              <div className="rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs leading-5">
                You cannot open this trade because it has a minimum limit of{" "}
                {fmt(selectedMinAmount)}. Use another code or quit trading.
              </div>
            )}
            {amountAboveMaximum && (
              <div className="rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs leading-5">
                This partner portfolio has a maximum limit of {fmt(selectedMaxAmount)}.
              </div>
            )}
            {tradeWarning && (
              <div className="rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs leading-5">
                {tradeWarning}
              </div>
            )}
            <div className="rounded-xl bg-muted/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {isSignalTrade ? "Expected profit" : "Settlement"}
                </span>
                <span className={isSignalTrade ? "font-semibold text-success" : "font-semibold"}>
                  {isSignalTrade ? fmt(expectedProfit) : "Loss after cycle"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
              I have read and agree Copy Trading Agreement
            </div>
            <Button
              onClick={() => apply.mutate()}
              disabled={
                apply.isPending ||
                !kycApproved ||
                (isSignalTrade && !code.trim()) ||
                Number(amount) <= 0 ||
                amountBelowMinimum ||
                amountAboveMaximum
              }
              className="h-12 w-full gradient-gold"
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
      <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setView("analysts")}
          className={`rounded-full py-2.5 transition ${view === "analysts" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          Analysts
        </button>
        <button
          type="button"
          onClick={() => setView("my")}
          className={`rounded-full py-2.5 transition ${view === "my" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          My trades
        </button>
        <button
          type="button"
          onClick={() => setView("partners")}
          className={`rounded-full py-2.5 transition ${view === "partners" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          Partners
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 rounded-full bg-muted/70 pl-11"
            placeholder="Search analyst"
          />
        </div>
        <Button
          onClick={() => {
            setSelectedAnalyst(manualSignal);
            setTradeWarning("");
          }}
          className="h-12 rounded-full px-5"
        >
          Signal
        </Button>
      </div>

      {view === "analysts" && (
        <div className="space-y-3">
          {visibleAnalysts.map((analyst: any) => (
            <article key={analyst.name} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <AnalystAvatar analyst={analyst} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold">{analyst.name}</h3>
                  <p className="text-xs font-medium text-muted-foreground">{analyst.role}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {analyst.bio}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedAnalyst(analyst);
                    setTradeWarning("");
                  }}
                >
                  Copy
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Rate label="1-day return" value={analyst.oneDay} />
                <Rate label="7-day ROI" value={analyst.sevenDay} />
                <Rate label="Minimum" value={fmt(analyst.min_copy_amount ?? 1)} />
                <Rate label="Commission" value={`${Number(analyst.commission_rate ?? 0) * 100}%`} />
              </div>
            </article>
          ))}
        </div>
      )}

      {view === "partners" && (
        <section className="glass-card rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold">Partner details</h2>
          <div className="space-y-3">
            {analysts.map((analyst: any) => (
              <button
                key={analyst.name}
                onClick={() => {
                  setSelectedAnalyst(analyst);
                  setTradeWarning("");
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left"
              >
                <AnalystAvatar analyst={analyst} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{analyst.name}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{analyst.bio}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold text-success">{analyst.sevenDay}</div>
                  <div className="text-muted-foreground">
                    Min {fmt(analyst.min_copy_amount ?? 1)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "my" && (
        <section className="glass-card rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold">My copy trades</h2>
          {(data?.trades ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No copy trades yet.
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.trades ?? []).map((trade: any) => (
                <div key={trade.id} className="rounded-xl bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold capitalize">
                      {trade.trade_type.replace("locked", "locked ")}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                        trade.status === "open"
                          ? "bg-primary/15 text-primary"
                          : trade.status === "won"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {trade.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <MiniStat label="Capital" value={fmt(trade.amount)} />
                    <MiniStat label="Profit paid" value={fmt(trade.total_profit_paid)} />
                    <MiniStat
                      label={trade.status === "open" ? "Closes" : "Closed"}
                      value={new Date(trade.closes_at).toLocaleDateString()}
                      icon={trade.status === "open" ? Clock : LockKeyhole}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AnalystAvatar({ analyst, size = "sm" }: { analyst: any; size?: "sm" | "lg" }) {
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${analyst.color} text-white ${
        size === "lg" ? "h-16 w-16 text-xl" : "h-12 w-12 text-base"
      } font-black`}
    >
      {analyst.avatar_url ? (
        <img src={analyst.avatar_url} alt={analyst.name} className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-5 w-5" />
      )}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1 text-sm font-bold text-success">
        <TrendingUp className="h-3.5 w-3.5" /> {value}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
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
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}
