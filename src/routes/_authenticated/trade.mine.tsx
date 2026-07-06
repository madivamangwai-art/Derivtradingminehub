import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listPackages, purchasePackage } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Coins, Clock, TrendingUp, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trade/mine")({ component: MinePage });

const fmt = (n: any) => `KES ${Number(n).toLocaleString()}`;
const tierColors: Record<string, string> = {
  bronze: "from-amber-800 to-amber-600",
  silver: "from-slate-500 to-slate-300",
  gold: "from-yellow-600 to-yellow-400",
  diamond: "from-cyan-500 to-blue-400",
  platinum: "from-fuchsia-500 to-rose-400",
};

function MinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPackages);
  const buyFn = useServerFn(purchasePackage);
  const { data: pkgs } = useQuery({ queryKey: ["packages"], queryFn: () => listFn() });
  const buy = useMutation({
    mutationFn: (id: string) => buyFn({ data: { package_id: id } }),
    onSuccess: () => { toast.success("Package activated!"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Purchase failed"),
  });

  return (
    <div className="space-y-3">
      {(pkgs ?? []).map((p: any) => {
        const totalReturn = Number(p.daily_payout) * p.duration_days;
        return (
          <div key={p.id} className="glass-card overflow-hidden rounded-2xl">
            <div className={`bg-gradient-to-r ${tierColors[p.tier] ?? "from-primary to-primary"} px-4 py-3 text-slate-900`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase opacity-80">{p.code}</div>
                  <div className="text-lg font-bold">{p.name}</div>
                </div>
                <Coins className="h-6 w-6 opacity-70" />
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat icon={Coins} label="Price" value={fmt(p.price)} />
                <Stat icon={TrendingUp} label="Daily" value={fmt(p.daily_payout)} highlight />
                <Stat icon={Clock} label="Days" value={String(p.duration_days)} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Total return</span>
                <span className="font-semibold text-success">{fmt(totalReturn)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground"><Gift className="h-3 w-3" /> Referral bonus</span>
                <span className="font-semibold text-primary">{fmt(p.referral_bonus)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Purchase limit</span>
                <span className={`font-semibold ${p.purchases_remaining > 0 ? "text-success" : "text-destructive"}`}>
                  {p.purchased_count}/{p.purchase_limit}
                </span>
              </div>
              <Button
                onClick={() => buy.mutate(p.id)}
                disabled={buy.isPending || p.purchases_remaining <= 0}
                className="mt-4 w-full gradient-gold"
              >
                {p.purchases_remaining > 0 ? `Buy for ${fmt(p.price)}` : "Limit reached"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon: Icon, label, value, highlight }: any) {
  return (
    <div>
      <Icon className={`mx-auto h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      <div className="mt-1 text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
