import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListSpins } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";

export const Route = createFileRoute("/_authenticated/admin/spins")({ component: SpinsAdmin });

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString()}`;

function SpinsAdmin() {
  const fn = useServerFn(adminListSpins);
  const { data, isLoading } = useQuery({ queryKey: ["admin-spins"], queryFn: () => fn() });

  return (
    <AdminShell title="Spin activity">
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Stat label="Tickets sold" value={String(data?.stats.total ?? 0)} />
        <Stat label="Total wagered" value={fmt(data?.stats.spent)} />
        <Stat label="Total paid out" value={fmt(data?.stats.won)} />
        <Stat label="House edge" value={data?.stats.spent ? `${(((data.stats.spent - data.stats.won) / data.stats.spent) * 100).toFixed(1)}%` : "—"} />
      </div>
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_100px_120px_120px_140px_160px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
          <div>User</div><div>Tier</div><div>Source</div><div>Result</div><div>Prize</div><div>When</div>
        </div>
        {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>}
        {(data?.rows ?? []).map((t: any) => (
          <div key={t.id} className="grid grid-cols-[1fr_100px_120px_120px_140px_160px] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm last:border-0">
            <div className="truncate">{t.profile?.full_name || t.profile?.email || t.user_id.slice(0, 8)}</div>
            <div>{t.value_kes}</div>
            <div className="text-xs text-muted-foreground">{t.source}</div>
            <div className="text-xs">{t.prize_label ?? "—"}</div>
            <div className={Number(t.prize_amount) > 0 ? "text-success" : "text-muted-foreground"}>{t.prize_amount ? fmt(t.prize_amount) : "—"}</div>
            <div className="text-[11px] text-muted-foreground">{new Date(t.used_at ?? t.created_at).toLocaleString()}</div>
          </div>
        ))}
        {!isLoading && (data?.rows ?? []).length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No spin activity yet.</div>}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
