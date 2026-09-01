import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getSpinData, buyTickets, spinTicket, TICKET_VALUES } from "@/lib/spin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Ticket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trade/spin")({ component: SpinPage });

function SpinPage() {
  const dataFn = useServerFn(getSpinData);
  const buyFn = useServerFn(buyTickets);
  const spinFn = useServerFn(spinTicket);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["spin"], queryFn: () => dataFn() });

  const [tier, setTier] = useState<number>(50);
  const [qty, setQty] = useState<string>("1");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; prize: number; free: boolean } | null>(null);

  const wheel = data?.wheels?.[tier] ?? [];
  const availableCount = data?.ticketCounts?.[tier] ?? 0;

  const buy = useMutation({
    mutationFn: async () => buyFn({ data: { value: tier, qty: Number(qty) } }),
    onSuccess: () => { toast.success("Tickets purchased"); qc.invalidateQueries({ queryKey: ["spin"] }); qc.invalidateQueries({ queryKey: ["wallet"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const spin = async () => {
    if (spinning || availableCount < 1) return;
    setSpinning(true);
    setResult(null);
    try {
      const r = await spinFn({ data: { value: tier } });
      const slots = wheel.length;
      const slice = 360 / slots;
      // Spin to land the slot at top (rotating counter-clockwise visually)
      const target = 360 * 6 + (360 - r.slotIndex * slice) - slice / 2;
      setAngle((prev) => prev + target);
      setTimeout(() => {
        setResult({ label: r.label, prize: r.prize, free: r.free });
        setSpinning(false);
        qc.invalidateQueries({ queryKey: ["spin"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        if (r.prize > 0) toast.success(`You won KES ${r.prize.toLocaleString()}!`);
        else if (r.free) toast.success("Free ticket awarded!");
      }, 3500);
    } catch (e: any) {
      toast.error(e.message);
      setSpinning(false);
    }
  };

  const colors = ["#f59e0b", "#0f172a", "#fbbf24", "#1e293b", "#f97316", "#0f172a", "#fbbf24", "#1e293b", "#f59e0b", "#0f172a", "#dc2626", "#1e293b"];

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
          <span>Choose ticket tier</span>
          <span>Your tickets</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {TICKET_VALUES.map((v) => (
            <button key={v} onClick={() => { setTier(v); setResult(null); }} className={`rounded-lg py-2 text-xs font-semibold transition ${tier === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <div>{v}</div>
              <div className="text-[10px] opacity-80">{data?.ticketCounts?.[v] ?? 0} left</div>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="relative mx-auto h-64 w-64">
          <svg viewBox="0 0 200 200" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? "transform 3.4s cubic-bezier(0.17, 0.67, 0.16, 0.99)" : "none" }} className="drop-shadow-xl">
            {wheel.map((slot, i) => {
              const slice = (2 * Math.PI) / wheel.length;
              const a1 = i * slice - Math.PI / 2;
              const a2 = (i + 1) * slice - Math.PI / 2;
              const x1 = 100 + 95 * Math.cos(a1);
              const y1 = 100 + 95 * Math.sin(a1);
              const x2 = 100 + 95 * Math.cos(a2);
              const y2 = 100 + 95 * Math.sin(a2);
              const mid = (a1 + a2) / 2;
              const tx = 100 + 60 * Math.cos(mid);
              const ty = 100 + 60 * Math.sin(mid);
              return (
                <g key={i}>
                  <path d={`M100 100 L${x1} ${y1} A95 95 0 0 1 ${x2} ${y2} Z`} fill={colors[i % colors.length]} stroke="#0f172a" strokeWidth="1" />
                  <text x={tx} y={ty} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" transform={`rotate(${((mid + Math.PI / 2) * 180) / Math.PI} ${tx} ${ty})`}>{slot.label}</text>
                </g>
              );
            })}
            <circle cx="100" cy="100" r="15" fill="#f59e0b" stroke="#0f172a" strokeWidth="2" />
          </svg>
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
            <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-destructive" />
          </div>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">Tier: {tier} KES · {availableCount} ticket(s) available</div>
        <Button onClick={spin} disabled={spinning || availableCount < 1} className="mt-3 w-full gradient-gold">
          <Sparkles className="mr-1 h-4 w-4" /> {spinning ? "Spinning…" : availableCount < 1 ? "Buy a ticket to spin" : "Spin"}
        </Button>
        {result && !spinning && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-center text-sm">
            Landed on <span className="font-bold">{result.label}</span> · {result.prize > 0 ? `Won KES ${result.prize}` : result.free ? "Free ticket!" : "No prize"}
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Ticket className="h-4 w-4" /> Buy tickets</div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Qty</label>
            <Input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">KES {(tier * Number(qty || 0)).toLocaleString()}</span></div>
          <Button onClick={() => buy.mutate()} disabled={buy.isPending || Number(qty) < 1}>{buy.isPending ? "…" : "Buy"}</Button>
        </div>
      </div>

      {data && data.history.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 text-sm font-semibold">Recent spins</div>
          <div className="space-y-1 text-xs">
            {data.history.slice(0, 8).map((h: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{new Date(h.used_at).toLocaleString()} · {h.value_kes} tier</span>
                <span className={Number(h.prize_amount) > 0 ? "font-semibold text-success" : "text-muted-foreground"}>
                  {h.label} {Number(h.prize_amount) > 0 && `(+${Number(h.prize_amount).toLocaleString()})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
