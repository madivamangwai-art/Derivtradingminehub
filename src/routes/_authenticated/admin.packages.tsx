import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminDeletePackage,
  adminGetPackages,
  adminListPackagePurchases,
  adminUpsertPackage,
} from "@/lib/admin.functions";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/packages")({
  beforeLoad: requireAdminRoute,
  component: PackagesPage,
});

type PkgForm = {
  id?: string;
  code: string;
  name: string;
  tier: "bronze" | "silver" | "gold" | "diamond" | "platinum";
  price: number;
  daily_payout: number;
  duration_days: number;
  referral_bonus: number;
  sort_order: number;
  active: boolean;
  payout_mode?: "locked" | "daily";
  maturity_return_rate?: number;
};

const empty: PkgForm = {
  code: "",
  name: "",
  tier: "bronze",
  price: 0,
  daily_payout: 0,
  duration_days: 60,
  referral_bonus: 0,
  sort_order: 0,
  active: true,
  payout_mode: "daily",
  maturity_return_rate: 1,
};

function PackagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminGetPackages);
  const purchasesFn = useServerFn(adminListPackagePurchases);
  const upsertFn = useServerFn(adminUpsertPackage);
  const deleteFn = useServerFn(adminDeletePackage);
  const { data } = useQuery({ queryKey: ["admin-packages"], queryFn: () => listFn() });
  const { data: purchases } = useQuery({
    queryKey: ["admin-package-purchases"],
    queryFn: () => purchasesFn(),
  });
  const [form, setForm] = useState<PkgForm>(empty);
  const activeCount = (purchases ?? []).filter((p: any) => p.real_status === "active").length;
  const depletedCount = (purchases ?? []).filter((p: any) => p.real_status === "depleted").length;
  const completedCount = (purchases ?? []).filter((p: any) => p.real_status === "completed").length;
  const expectedDaily = (purchases ?? [])
    .filter((p: any) => p.counts_expected_outflow)
    .reduce((sum: number, p: any) => sum + Number(p.packages?.daily_payout ?? 0), 0);

  const save = useMutation({
    mutationFn: () => upsertFn({ data: form }),
    onSuccess: () => {
      toast.success("Package saved");
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (result: any) => {
      toast.success(
        result.mode === "deactivated"
          ? "Package has purchases, so it was retired instead."
          : "Package deleted.",
      );
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete package"),
  });

  const selectPackage = (pkg: any) => {
    setForm({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      tier: pkg.tier,
      price: Number(pkg.price),
      daily_payout: Number(pkg.daily_payout),
      duration_days: Number(pkg.duration_days),
      referral_bonus: Number(pkg.referral_bonus),
      sort_order: Number(pkg.sort_order),
      active: Boolean(pkg.active),
      payout_mode: pkg.payout_mode ?? "daily",
      maturity_return_rate: Number(pkg.maturity_return_rate ?? 1),
    });
  };

  const handleModeChange = (mode: PkgForm["payout_mode"]) => {
    setForm({
      ...form,
      payout_mode: mode,
      duration_days: mode === "locked" ? 60 : 45,
      daily_payout: mode === "locked" ? 0 : form.daily_payout,
      maturity_return_rate:
        mode === "locked" ? Math.max(form.maturity_return_rate ?? 1.3, 1.25) : 1,
    });
  };

  return (
    <AdminShell title="Packages">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="grid grid-cols-[76px_1fr_86px_96px_86px_78px_112px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
            <div>Code</div>
            <div>Name</div>
            <div>Mode</div>
            <div>Price</div>
            <div>Daily</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {(data ?? []).map((p: any) => (
            <div
              key={p.id}
              className="grid grid-cols-[76px_1fr_86px_96px_86px_78px_112px] items-center gap-2 border-b border-border/40 px-4 py-3 text-left text-sm hover:bg-muted/40"
            >
              <div className="font-semibold">{p.code}</div>
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.tier} - {Number(p.duration_days)} days - referral KES{" "}
                  {Number(p.referral_bonus).toLocaleString()}
                </div>
              </div>
              <div className="text-xs capitalize text-primary">{p.payout_mode ?? "daily"}</div>
              <div>{Number(p.price).toLocaleString()}</div>
              <div>{Number(p.daily_payout).toLocaleString()}</div>
              <div>{p.active ? "Live" : "Retired"}</div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => selectPackage(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${p.name}? Packages with purchases will be retired.`)) {
                      remove.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{form.id ? "Edit" : "New"} package</h3>
            {form.id && (
              <Button size="sm" variant="secondary" onClick={() => setForm(empty)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label>Tier</Label>
                <select
                  className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as PkgForm["tier"] })}
                >
                  {["bronze", "silver", "gold", "diamond", "platinum"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Payout mode</Label>
                <select
                  className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                  value={form.payout_mode ?? "daily"}
                  onChange={(e) => handleModeChange(e.target.value as PkgForm["payout_mode"])}
                >
                  <option value="daily">Daily</option>
                  <option value="locked">Locked</option>
                </select>
              </div>
              <div>
                <Label>Maturity rate</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={form.maturity_return_rate ?? 1}
                  onChange={(e) =>
                    setForm({ ...form, maturity_return_rate: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Daily payout</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.daily_payout}
                  disabled={form.payout_mode === "locked"}
                  onChange={(e) => setForm({ ...form, daily_payout: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Referral bonus</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.referral_bonus}
                  onChange={(e) => setForm({ ...form, referral_bonus: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />{" "}
                  Active
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="flex-1 gradient-gold"
              >
                {save.isPending ? "Saving..." : form.id ? "Save changes" : "Create package"}
              </Button>
              <Button variant="secondary" onClick={() => setForm(empty)}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 glass-card overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Client package ledger</h3>
            <div className="text-xs text-muted-foreground">
              Active packages count in expected outflow only while their expiry date is still ahead.
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            <MiniStat label="Active" value={activeCount} tone="text-success" />
            <MiniStat label="Depleted" value={depletedCount} tone="text-warning" />
            <MiniStat label="Completed" value={completedCount} />
            <MiniStat
              label="Daily outflow"
              value={`KES ${expectedDaily.toLocaleString()}`}
              tone="text-primary"
            />
          </div>
        </div>
        <div className="hidden grid-cols-[1.3fr_1.2fr_82px_82px_96px_96px_90px_104px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid">
          <div>Client</div>
          <div>Package</div>
          <div>Mode</div>
          <div>Status</div>
          <div>Purchased</div>
          <div>Expires</div>
          <div>Paid out</div>
          <div>Outflow</div>
        </div>
        {(purchases ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No package purchases yet.
          </div>
        ) : (
          (purchases ?? []).map((p: any) => (
            <div
              key={p.id}
              className="grid gap-2 border-b border-border/40 px-4 py-3 text-sm lg:grid-cols-[1.3fr_1.2fr_82px_82px_96px_96px_90px_104px] lg:items-center"
            >
              <div>
                <div className="font-medium">{p.profile?.full_name ?? "Unnamed client"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.profile?.phone ?? p.profile?.email ?? p.user_id}
                </div>
              </div>
              <div>
                <div className="font-medium">
                  {p.packages?.code} - {p.packages?.name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  KES {Number(p.packages?.price ?? 0).toLocaleString()} -{" "}
                  {Number(p.packages?.duration_days ?? 0)} days
                </div>
              </div>
              <div className="text-xs capitalize text-primary">
                {p.packages?.payout_mode ?? "daily"}
              </div>
              <div>
                <StatusPill status={p.real_status} />
                {p.real_status === "active" ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {p.remaining_days}d left
                  </div>
                ) : null}
              </div>
              <DateCell value={p.purchased_at} />
              <DateCell value={p.expires_at} />
              <div>KES {Number(p.total_paid_out ?? 0).toLocaleString()}</div>
              <div
                className={
                  p.counts_expected_outflow ? "font-semibold text-success" : "text-muted-foreground"
                }
              >
                {p.counts_expected_outflow
                  ? `KES ${Number(p.packages?.daily_payout ?? 0).toLocaleString()}/day`
                  : "No"}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}

function MiniStat({ label, value, tone = "text-foreground" }: any) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-success/15 text-success"
      : status === "depleted"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";

  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${cls}`}>{status}</span>;
}

function DateCell({ value }: { value: string }) {
  return (
    <div className="text-xs text-muted-foreground">{new Date(value).toLocaleDateString()}</div>
  );
}
