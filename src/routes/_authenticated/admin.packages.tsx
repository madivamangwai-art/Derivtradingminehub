import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetPackages, adminUpsertPackage } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/packages")({ component: PackagesPage });

type PkgForm = {
  id?: string; code: string; name: string;
  tier: "bronze"|"silver"|"gold"|"diamond"|"platinum";
  price: number; daily_payout: number; duration_days: number;
  referral_bonus: number; sort_order: number; active: boolean;
};

const empty: PkgForm = { code: "", name: "", tier: "bronze", price: 0, daily_payout: 0, duration_days: 30, referral_bonus: 0, sort_order: 0, active: true };

function PackagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminGetPackages);
  const upsertFn = useServerFn(adminUpsertPackage);
  const { data } = useQuery({ queryKey: ["admin-packages"], queryFn: () => listFn() });
  const [form, setForm] = useState<PkgForm>(empty);

  const save = useMutation({
    mutationFn: () => upsertFn({ data: form }),
    onSuccess: () => { toast.success("Saved"); setForm(empty); qc.invalidateQueries({ queryKey: ["admin-packages"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminShell title="Packages">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="grid grid-cols-[80px_1fr_100px_100px_80px_60px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
            <div>Code</div><div>Name</div><div>Price</div><div>Daily</div><div>Bonus</div><div></div>
          </div>
          {(data ?? []).map((p: any) => (
            <button key={p.id} onClick={() => setForm(p)} className="grid w-full grid-cols-[80px_1fr_100px_100px_80px_60px] items-center gap-2 border-b border-border/40 px-4 py-3 text-left text-sm hover:bg-muted/40">
              <div className="font-medium">{p.code}</div>
              <div>{p.name} <span className="text-[10px] uppercase text-muted-foreground">· {p.tier}</span></div>
              <div>{Number(p.price).toLocaleString()}</div>
              <div>{Number(p.daily_payout).toLocaleString()}</div>
              <div>{Number(p.referral_bonus).toLocaleString()}</div>
              <div>{p.active ? "✓" : "—"}</div>
            </button>
          ))}
        </div>

        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-sm font-semibold">{form.id ? "Edit" : "New"} package</h3>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div>
                <Label>Tier</Label>
                <select className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as PkgForm["tier"] })}>
                  {["bronze","silver","gold","diamond","platinum"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Price</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
              <div><Label>Daily payout</Label><Input type="number" value={form.daily_payout} onChange={(e) => setForm({ ...form, daily_payout: Number(e.target.value) })} /></div>
              <div><Label>Duration (days)</Label><Input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) })} /></div>
              <div><Label>Referral bonus</Label><Input type="number" value={form.referral_bonus} onChange={(e) => setForm({ ...form, referral_bonus: Number(e.target.value) })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1 gradient-gold">{save.isPending ? "Saving…" : "Save"}</Button>
              {form.id && <Button variant="secondary" onClick={() => setForm(empty)}>New</Button>}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

