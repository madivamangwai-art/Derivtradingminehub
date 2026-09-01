import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListWithdrawals, adminUpdateWithdrawal } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { toast } from "sonner";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  beforeLoad: requireAdminRoute,
  component: Page,
});

const fmt = (n: any) => `KES ${Number(n).toLocaleString()}`;

function Page() {
  const listFn = useServerFn(adminListWithdrawals);
  const updFn = useServerFn(adminUpdateWithdrawal);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-withdrawals"], queryFn: () => listFn() });
  const upd = useMutation({
    mutationFn: (args: { id: string; status: "approved" | "rejected" | "paid" }) =>
      updFn({ data: args }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminShell title="Withdrawals">
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_110px_90px_110px_130px_120px_200px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
          <div>User</div>
          <div>Requested</div>
          <div>Fee</div>
          <div>Payout</div>
          <div>Phone</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {(data ?? []).map((d: any) => (
          <div
            key={d.id}
            className="grid grid-cols-[1fr_110px_90px_110px_130px_120px_200px] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm last:border-0"
          >
            <div>
              <div className="font-medium">
                {d.profile?.full_name || d.profile?.email || d.user_id.slice(0, 8)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <div>{fmt(d.amount)}</div>
            <div className="text-muted-foreground">{fmt(d.fee ?? 0)}</div>
            <div className="font-medium">
              {fmt(d.net_amount ?? Number(d.amount) - Number(d.fee ?? 0))}
            </div>
            <div className="text-xs">{d.mpesa_phone}</div>
            <div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">
                {d.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {d.status !== "paid" && d.status !== "rejected" && (
                <>
                  <button
                    onClick={() => upd.mutate({ id: d.id, status: "approved" })}
                    className="rounded-md bg-primary/20 px-2 py-1 text-xs text-primary"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => upd.mutate({ id: d.id, status: "paid" })}
                    className="rounded-md bg-success/20 px-2 py-1 text-xs text-success"
                  >
                    Mark paid
                  </button>
                  <button
                    onClick={() => upd.mutate({ id: d.id, status: "rejected" })}
                    className="rounded-md bg-destructive/20 px-2 py-1 text-xs text-destructive"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No withdrawal requests.
          </div>
        )}
      </div>
    </AdminShell>
  );
}
