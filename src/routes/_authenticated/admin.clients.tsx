import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListClients, adminPromote, adminAdjustWallet, adminResetClientPassword } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ChevronDown, ChevronRight, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  beforeLoad: requireAdminRoute,
  component: AdminClients,
});

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString()}`;

function AdminClients() {
  const listFn = useServerFn(adminListClients);
  const promoteFn = useServerFn(adminPromote);
  const resetPasswordFn = useServerFn(adminResetClientPassword);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: () => listFn() });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const adjustFn = useServerFn(adminAdjustWallet);
  const [adjInput, setAdjInput] = useState<Record<string, string>>({});

  const toggleAdmin = useMutation({
    mutationFn: async (args: { user_id: string; grant: boolean }) =>
      promoteFn({ data: { user_id: args.user_id, role: "admin", grant: args.grant } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjust = useMutation({
    mutationFn: async (args: { user_id: string; amount: number }) => adjustFn({ data: args }),
    onSuccess: () => {
      toast.success("Balance adjusted");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (user_id: string) => resetPasswordFn({ data: { user_id } }),
    onSuccess: (result: any) => {
      toast.success(`Password reset to phone number: ${result.password}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not reset password"),
  });

  return (
    <AdminShell title="Clients">
      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_1fr_120px_120px_60px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
          <div>Name</div>
          <div>Email</div>
          <div>Balance</div>
          <div>Joined</div>
          <div></div>
        </div>
        {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>}
        {(data ?? []).map((c: any) => {
          const isOpen = !!open[c.id];
          return (
            <div key={c.id} className="border-b border-border/40 text-sm last:border-0">
              <button
                onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
                className="grid w-full grid-cols-[1fr_1fr_120px_120px_60px] items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
              >
                <div className="font-medium">{c.full_name || "—"}</div>
                <div className="truncate text-muted-foreground">{c.email}</div>
                <div>{fmt(c.wallet?.balance)}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </div>
                <div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="bg-muted/20 px-4 py-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Info label="Phone" value={c.phone ?? "—"} />
                    <Info label="Referral code" value={c.referral_code} />
                    <Info label="Total deposited" value={fmt(c.wallet?.total_deposited)} />
                    <Info label="Total earned" value={fmt(c.wallet?.total_earned)} />
                    <Info label="Total withdrawn" value={fmt(c.wallet?.total_withdrawn)} />
                    <div>
                      <button
                        onClick={() => toggleAdmin.mutate({ user_id: c.id, grant: true })}
                        className="mr-2 inline-flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1.5 text-xs text-primary"
                      >
                        <ShieldCheck className="h-3 w-3" /> Make admin
                      </button>
                      <button
                        onClick={() => toggleAdmin.mutate({ user_id: c.id, grant: false })}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        <ShieldOff className="h-3 w-3" /> Revoke
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Reset ${c.full_name || c.email}'s password to their phone number?`)) {
                            resetPassword.mutate(c.id);
                          }
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning/20 px-3 py-1.5 text-xs text-foreground md:mt-0 md:ml-2"
                      >
                        <KeyRound className="h-3 w-3" /> Reset password
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                    <span className="text-[11px] text-muted-foreground">
                      Adjust balance (KES, negative to debit):
                    </span>
                    <Input
                      type="number"
                      className="h-8 w-32"
                      value={adjInput[c.id] ?? ""}
                      onChange={(e) => setAdjInput((s) => ({ ...s, [c.id]: e.target.value }))}
                      placeholder="e.g. 500"
                    />
                    <button
                      onClick={() => {
                        const v = Number(adjInput[c.id]);
                        if (!v) return;
                        adjust.mutate({ user_id: c.id, amount: v });
                        setAdjInput((s) => ({ ...s, [c.id]: "" }));
                      }}
                      className="rounded-md bg-primary/15 px-3 py-1.5 text-xs text-primary"
                    >
                      Apply
                    </button>
                  </div>
                  <h4 className="mt-4 mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Copy trading history
                  </h4>
                  {(c.trades ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No copy trades yet.</div>
                  ) : (
                    <div className="space-y-1">
                      {(c.trades ?? []).map((p: any) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="font-medium capitalize">{String(p.trade_type).replace("locked", "locked ")}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Opened {new Date(p.opened_at).toLocaleDateString()} - Code {p.code_entered}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase text-muted-foreground">Profit</div>
                            <div className="font-semibold">{fmt(p.total_profit_paid)}</div>
                          </div>
                          <span
                            className={`ml-3 rounded-full px-2 py-0.5 text-[10px] uppercase ${p.status === "open" ? "bg-primary/15 text-primary" : p.status === "won" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                          >
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No clients yet.</div>
        )}
      </div>
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
