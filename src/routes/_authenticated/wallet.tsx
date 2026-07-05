import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getWalletData, requestWithdrawal, getMyProfile, WITHDRAWAL_FEE_RATE } from "@/lib/app.functions";
import { initiateStkPush } from "@/lib/mpesa.functions";
import { ClientShell } from "@/components/layout/client-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/wallet")({ component: WalletPage });

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function WalletPage() {
  const fn = useServerFn(getWalletData);
  const profFn = useServerFn(getMyProfile);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wallet"], queryFn: () => fn() });
  const { data: prof } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const stk = useServerFn(initiateStkPush);
  const wd = useServerFn(requestWithdrawal);

  const [depAmt, setDepAmt] = useState("");
  const [wdAmt, setWdAmt] = useState("");
  const [pendingActivity, setPendingActivity] = useState<any[]>([]);
  const phone = prof?.profile?.phone ?? "";

  const deposit = useMutation({
    mutationFn: async () => stk({ data: { amount: Number(depAmt) } }),
    onSuccess: (r: any) => {
      if (r?.status === "success") toast.success("Deposit received — wallet credited");
      else if (r?.status === "failed") toast.error(r.message ?? "Payment not completed");
      else toast.info("Check your phone for the M-Pesa prompt. Balance updates once you confirm.");
      setDepAmt("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const withdraw = useMutation({
    mutationFn: async () => wd({ data: { amount: Number(wdAmt) } }),
    onSuccess: (r: any) => {
      const amount = Number(wdAmt);
      const fee = Math.round(amount * WITHDRAWAL_FEE_RATE * 100) / 100;
      const net = Math.round((amount - fee) * 100) / 100;
      setPendingActivity((prev) => [{
        id: r?.withdrawal_id ?? `withdrawal:${Date.now()}`,
        kind: "withdrawal",
        title: r?.status === "success" ? "Withdrawal completed" : "Withdrawal pending",
        amount: -amount,
        status: r?.status === "success" ? "success" : "processing",
        created_at: new Date().toISOString(),
        meta: { pending: true },
      }, ...prev]);
      toast.success(r?.status === "processing" ? `Withdrawal submitted. Funds should arrive in your M-Pesa account shortly.` : `Withdrawal request recorded`);
      setWdAmt("");
      void qc.invalidateQueries({ queryKey: ["wallet"] }).then(() => setPendingActivity([]));
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const activityItems = useMemo(() => {
    const merged = [...(data?.activity ?? []), ...pendingActivity];
    const seen = new Set<string>();
    return merged.filter((item: any) => {
      const id = String(item?.id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a: any, b: any) => {
      const aPending = a.status === "pending" ? 0 : 1;
      const bPending = b.status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data?.activity, pendingActivity]);

  return (
    <ClientShell title="Wallet">
      <div className="glass-card rounded-2xl p-5">
        <div className="text-xs uppercase text-muted-foreground">Available balance</div>
        <div className="mt-1 text-3xl font-bold">{fmt(data?.wallet?.balance)}</div>
        <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div>Deposited<br /><span className="text-foreground">{fmt(data?.wallet?.total_deposited)}</span></div>
          <div>Earned<br /><span className="text-foreground">{fmt(data?.wallet?.total_earned)}</span></div>
          <div>Withdrawn<br /><span className="text-foreground">{fmt(data?.wallet?.total_withdrawn)}</span></div>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Registered M-Pesa number: <span className="font-medium text-foreground">{phone || "not set"}</span>
        {!phone && <> · <Link to="/my" className="text-primary">Add it now</Link></>}
      </div>

      <Tabs defaultValue="deposit" className="mt-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="glass-card mt-3 rounded-2xl p-4">
          <div className="space-y-3">
            <div><Label>Amount (KES)</Label><Input type="number" min={10} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} /></div>
            <Button onClick={() => deposit.mutate()} disabled={deposit.isPending || !depAmt || !phone} className="w-full gradient-gold">
              {deposit.isPending ? "Sending prompt…" : "Send M-Pesa STK Push"}
            </Button>
            <p className="text-[11px] text-muted-foreground">The prompt will be sent to {phone || "your registered number"}.</p>
          </div>
        </TabsContent>

        <TabsContent value="withdraw" className="glass-card mt-3 rounded-2xl p-4">
          <div className="space-y-3">
            <div><Label>Amount (KES)</Label><Input type="number" value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} /></div>
            {Number(wdAmt) > 0 && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Requested</span><span>{fmt(Number(wdAmt))}</span></div>
                <div className="mt-1 flex justify-between border-t border-border/60 pt-1 font-medium"><span>You receive</span><span>{fmt(Math.round((Number(wdAmt) * (1 - WITHDRAWAL_FEE_RATE)) * 100) / 100)}</span></div>
              </div>
            )}
            <Button onClick={() => withdraw.mutate()} disabled={withdraw.isPending || !wdAmt || !phone} className="w-full" variant="secondary">
              {withdraw.isPending ? "Requesting…" : "Request withdrawal"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Withdrawals are submitted to M-Pesa directly and should reach your account shortly.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Transactions</h2>
        <div className="space-y-2">
          {activityItems.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>}
          {activityItems.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm">
              <div>
                <div className="font-medium capitalize">{t.title}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()} · {t.status === "processing" ? "Processing" : t.status === "pending" ? "Pending" : t.status === "failed" ? "Failed" : "Completed"}</div>
              </div>
              <div className={Number(t.amount) >= 0 ? "text-success" : "text-destructive"}>{Number(t.amount) >= 0 ? "+" : ""}{fmt(t.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </ClientShell>
  );
}
