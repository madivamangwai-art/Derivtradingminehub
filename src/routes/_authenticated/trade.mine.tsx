import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { applyCopyTrade, getCopyTradingData, type CopyTradeType } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Clock, LockKeyhole, SlidersHorizontal, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trade/mine")({ component: CopyTradingPage });

const fmt = (n: any) =>
  `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const tradeTypes: Array<{
  value: CopyTradeType;
  title: string;
  term: string;
  detail: string;
}> = [
  {
    value: "daily",
    title: "Daily Copy Trading",
    term: "30 min",
    detail: "Capital plus 1.6% returns when the session closes.",
  },
  {
    value: "locked7",
    title: "7-Day Locked",
    term: "7 days",
    detail: "Capital stays locked while 1.6% profit accrues daily.",
  },
  {
    value: "locked30",
    title: "30-Day Locked",
    term: "30 days",
    detail: "Long lock with daily 1.6% profit accrual.",
  },
];

function CopyTradingPage() {
  const qc = useQueryClient();
  const dataFn = useServerFn(getCopyTradingData);
  const applyFn = useServerFn(applyCopyTrade);
  const { data } = useQuery({ queryKey: ["copy-trading"], queryFn: () => dataFn() });
  const [tradeType, setTradeType] = useState<CopyTradeType>("daily");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const selected = tradeTypes.find((item) => item.value === tradeType)!;
  const expectedProfit = Number(amount || 0) * Number(data?.profitRate ?? 0.016);

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
      qc.invalidateQueries({ queryKey: ["copy-trading"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Copy trade failed"),
  });

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Available Balance</div>
            <div className="mt-1 text-3xl font-bold">{fmt(data?.wallet?.balance)}</div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <SlidersHorizontal className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Follow Signal</h2>
            <p className="text-xs text-muted-foreground">Profit rate: 1.6% per valid trade cycle.</p>
          </div>
          <TrendingUp className="h-5 w-5 text-success" />
        </div>

        <RadioGroup
          value={tradeType}
          onValueChange={(value) => setTradeType(value as CopyTradeType)}
          className="grid gap-2"
        >
          {tradeTypes.map((type) => (
            <label
              key={type.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                tradeType === type.value ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <RadioGroupItem value={type.value} className="mt-1" />
              <span className="flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{type.title}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {type.term}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{type.detail}</span>
              </span>
            </label>
          ))}
        </RadioGroup>

        <div className="mt-4 space-y-3">
          <div>
            <Label>Signal Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter signal code"
            />
          </div>
          <div>
            <Label>Copy Trading Amount</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
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
          <div className="rounded-xl bg-muted/40 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selected cycle</span>
              <span className="font-medium">{selected.term}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Expected profit</span>
              <span className="font-semibold text-success">{fmt(expectedProfit)}</span>
            </div>
          </div>
          <Button
            onClick={() => apply.mutate()}
            disabled={apply.isPending || !code.trim() || Number(amount) <= 0}
            className="w-full gradient-gold"
          >
            {apply.isPending ? "Applying..." : "Apply to Copy Trading"}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold">My Copy Trading</h2>
        {(data?.trades ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No copy trades yet.
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.trades ?? []).map((trade: any) => {
              const open = trade.status === "open";
              return (
                <div key={trade.id} className="rounded-xl bg-card p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold capitalize">
                        {trade.trade_type.replace("locked", "locked ")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Code {trade.code_entered} - {new Date(trade.opened_at).toLocaleString()}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                        open
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
                      label={open ? "Closes" : "Closed"}
                      value={new Date(trade.closes_at).toLocaleDateString()}
                      icon={open ? Clock : LockKeyhole}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
