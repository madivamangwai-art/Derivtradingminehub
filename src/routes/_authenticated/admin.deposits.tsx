import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListDeposits, adminApproveDeposit } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { toast } from "sonner";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  beforeLoad: requireAdminRoute,
  component: DepositsPage,
});

const fmt = (n: any) => `KES ${Number(n).toLocaleString()}`;

function DepositsPage() {
  const listFn = useServerFn(adminListDeposits);
  const actFn = useServerFn(adminApproveDeposit);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-deposits"], queryFn: () => listFn() });
  const act = useMutation({
    mutationFn: (args: { deposit_id: string; approve: boolean }) => actFn({ data: args }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminShell title="Deposits">
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_120px_140px_140px_180px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
          <div>User</div>
          <div>Amount</div>
          <div>Receipt</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {(data ?? []).map((d: any) => (
          <div
            key={d.id}
            className="grid grid-cols-[1fr_120px_140px_140px_180px] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm last:border-0"
          >
            <div>
              <div className="font-medium">
                {d.profile?.full_name || d.profile?.email || d.user_id.slice(0, 8)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {d.mpesa_phone} · {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <div>{fmt(d.amount)}</div>
            <div className="text-xs">{d.mpesa_receipt ?? "—"}</div>
            <div>
              <StatusBadge s={d.status} />
            </div>
            <div>
              {d.status === "pending" && (
                <div className="flex gap-1">
                  <button
                    onClick={() => act.mutate({ deposit_id: d.id, approve: true })}
                    className="rounded-md bg-success/20 px-3 py-1 text-xs text-success"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => act.mutate({ deposit_id: d.id, approve: false })}
                    className="rounded-md bg-destructive/20 px-3 py-1 text-xs text-destructive"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No deposits yet.</div>
        )}
      </div>
    </AdminShell>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    success: "bg-success/20 text-success",
    failed: "bg-destructive/20 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${map[s] ?? "bg-muted text-muted-foreground"}`}
    >
      {s}
    </span>
  );
}
