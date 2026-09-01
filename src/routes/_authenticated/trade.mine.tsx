import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getPackageMaturityReturnRate,
  getPackagePayoutMode,
  listPackages,
  purchasePackage,
} from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, Clock, TrendingUp, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trade/mine")({ component: MinePage });

const fmt = (n: any) => `KES ${Number(n).toLocaleString()}`;
const tierColors: Record<string, string> = {
  bronze: "from-orange-500 via-amber-400 to-yellow-300",
  silver: "from-sky-500 via-cyan-300 to-emerald-300",
  gold: "from-yellow-300 via-amber-400 to-orange-500",
  diamond: "from-cyan-300 via-sky-400 to-blue-500",
  platinum: "from-fuchsia-400 via-rose-400 to-amber-300",
};
const packageGroups = [
  { value: "locked-60", label: "Locked 60 days" },
  { value: "daily-45", label: "Daily 45 days" },
  { value: "daily-30", label: "Daily 30 days" },
] as const;
type PackageGroup = (typeof packageGroups)[number]["value"];

function getPackageGroup(pkg: any): PackageGroup {
  const mode = getPackagePayoutMode(pkg);
  if (mode === "locked") return "locked-60";
  return Number(pkg.duration_days) === 30 ? "daily-30" : "daily-45";
}

function MinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPackages);
  const buyFn = useServerFn(purchasePackage);
  const [activeGroup, setActiveGroup] = useState<PackageGroup>("locked-60");
  const { data: pkgs } = useQuery({ queryKey: ["packages"], queryFn: () => listFn() });
  const visiblePackages = (pkgs ?? []).filter((p: any) => getPackageGroup(p) === activeGroup);
  const buy = useMutation({
    mutationFn: (id: string) => buyFn({ data: { package_id: id } }),
    onSuccess: () => {
      toast.success("Package activated!");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Purchase failed"),
  });

  return (
    <div className="space-y-3">
      <Tabs value={activeGroup} onValueChange={(value) => setActiveGroup(value as PackageGroup)}>
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl">
          {packageGroups.map((group) => (
            <TabsTrigger key={group.value} value={group.value} className="min-h-10 text-xs">
              {group.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visiblePackages.map((p: any) => {
        const mode = getPackagePayoutMode(p);
        const totalReturn =
          mode === "locked"
            ? Number(p.price) * getPackageMaturityReturnRate(p)
            : Number(p.daily_payout) * p.duration_days + Number(p.price);
        const dailyRate =
          Number(p.price) > 0 ? (Number(p.daily_payout) / Number(p.price)) * 100 : 0;
        const profit = totalReturn - Number(p.price);
        const profitRate = Number(p.price) > 0 ? (profit / Number(p.price)) * 100 : 0;
        return (
          <div key={p.id} className="glass-card overflow-hidden rounded-2xl">
            <div
              className={`bg-gradient-to-r ${tierColors[p.tier] ?? "from-primary to-accent"} px-4 py-3 text-slate-950`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase opacity-80">
                    {p.code} -{" "}
                    {mode === "locked"
                      ? `${p.duration_days} day locked`
                      : `${p.duration_days} day daily`}
                  </div>
                  <div className="text-lg font-bold">{p.name}</div>
                </div>
                <Coins className="h-6 w-6 opacity-70" />
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat icon={Coins} label="Price" value={fmt(p.price)} />
                <Stat
                  icon={TrendingUp}
                  label={mode === "locked" ? "Maturity" : "Daily"}
                  value={
                    mode === "locked"
                      ? `${Math.round(getPackageMaturityReturnRate(p) * 100)}%`
                      : fmt(p.daily_payout)
                  }
                  highlight
                />
                <Stat icon={Clock} label="Term" value={`${p.duration_days}d`} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {mode === "locked" ? "Locked maturity value" : "Total package value"}
                </span>
                <span className="font-semibold text-success">{fmt(totalReturn)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-success/15 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Expected profit</span>
                <span className="font-semibold text-success">
                  {fmt(profit)} ({profitRate.toFixed(0)}%)
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Cash flow</span>
                <span className="font-semibold text-primary">
                  {mode === "locked"
                    ? "Locked until maturity"
                    : `${dailyRate.toFixed(1)}% daily for ${p.duration_days} days`}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Gift className="h-3 w-3" /> Referral bonus
                </span>
                <span className="font-semibold text-primary">{fmt(p.referral_bonus)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Purchase limit</span>
                <span
                  className={`font-semibold ${p.purchases_remaining > 0 ? "text-success" : "text-destructive"}`}
                >
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
      {visiblePackages.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center text-sm text-muted-foreground">
          No active packages in this group yet.
        </div>
      ) : null}
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
