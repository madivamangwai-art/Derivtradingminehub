import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListRedPackets } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/redpackets")({
  beforeLoad: requireAdminRoute,
  component: RedPacketsAdmin,
});

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString()}`;

function RedPacketsAdmin() {
  const fn = useServerFn(adminListRedPackets);
  const { data, isLoading } = useQuery({ queryKey: ["admin-redpackets"], queryFn: () => fn() });

  const total = (data ?? []).reduce((s, p: any) => s + Number(p.total_amount), 0);
  const claimed = (data ?? []).reduce((s, p: any) => s + p.claimed_count, 0);

  return (
    <AdminShell title="Red Packets">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Packets" value={String((data ?? []).length)} />
        <Stat label="Total value" value={fmt(total)} />
        <Stat label="Claims made" value={String(claimed)} />
      </div>
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_140px_140px_120px_140px_100px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
          <div>Creator</div>
          <div>Code</div>
          <div>Total</div>
          <div>Ticket</div>
          <div>Claimed</div>
          <div>Status</div>
        </div>
        {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>}
        {(data ?? []).map((p: any) => (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_140px_140px_120px_140px_100px] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm last:border-0"
          >
            <div>
              <div className="font-medium">
                {p.creator?.full_name || p.creator?.email || p.creator_id.slice(0, 8)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </div>
            </div>
            <div className="font-mono text-xs">{p.code}</div>
            <div>{fmt(p.total_amount)}</div>
            <div>{p.ticket_value} KES</div>
            <div>
              {p.claimed_count} / {p.max_claims}
            </div>
            <div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${p.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
              >
                {p.status}
              </span>
            </div>
          </div>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No red packets yet.</div>
        )}
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
