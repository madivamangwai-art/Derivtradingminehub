import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getRedPacketData, createRedPacket, claimRedPacket } from "@/lib/redpacket.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trade/redpacket")({ component: RedPacketPage });

const TICKET_VALUES = [50, 100, 500, 1000];

function RedPacketPage() {
  const dataFn = useServerFn(getRedPacketData);
  const createFn = useServerFn(createRedPacket);
  const claimFn = useServerFn(claimRedPacket);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["redpackets"], queryFn: () => dataFn() });

  const [amt, setAmt] = useState("1000");
  const [count, setCount] = useState("10");
  const [tv, setTv] = useState(50);
  const [claimCode, setClaimCode] = useState("");

  const create = useMutation({
    mutationFn: async () => createFn({ data: { total_amount: Number(amt), max_claims: Number(count), ticket_value: tv } }),
    onSuccess: (r) => { toast.success(`Red packet created: ${r.code}`); qc.invalidateQueries({ queryKey: ["redpackets"] }); qc.invalidateQueries({ queryKey: ["wallet"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const claim = useMutation({
    mutationFn: async () => claimFn({ data: { code: claimCode.trim().toUpperCase() } }),
    onSuccess: (r) => { toast.success(`Claimed ${r.tickets} x ${r.ticket_value} KES ticket(s)!`); setClaimCode(""); qc.invalidateQueries({ queryKey: ["redpackets"] }); qc.invalidateQueries({ queryKey: ["spin"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const perClaim = Math.floor(Number(amt || 0) / Math.max(1, Number(count || 1)));
  const perClaimTickets = Math.floor(perClaim / tv);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gift className="h-4 w-4 text-primary" /> Claim a red packet</div>
        <div className="flex gap-2">
          <Input value={claimCode} onChange={(e) => setClaimCode(e.target.value.toUpperCase())} placeholder="Enter code (e.g. RPABC123)" />
          <Button onClick={() => claim.mutate()} disabled={claim.isPending || !claimCode}>Claim</Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gift className="h-4 w-4 text-destructive" /> Send a red packet</div>
        <div className="space-y-3">
          <div><Label>Total amount (KES, from your wallet)</Label><Input type="number" min={100} value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
          <div><Label>Number of claimers</Label><Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} /></div>
          <div>
            <Label>Ticket value</Label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {TICKET_VALUES.map((v) => (
                <button key={v} type="button" onClick={() => setTv(v)} className={`rounded-lg py-2 text-xs font-semibold ${tv === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{v} KES</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
            Each claimer gets ≈ <span className="text-foreground font-semibold">{perClaimTickets}</span> ticket(s) of {tv} KES ({perClaim} KES worth).
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || perClaimTickets < 1} className="w-full gradient-gold">
            {create.isPending ? "Creating…" : `Create & pay ${Number(amt).toLocaleString()} KES`}
          </Button>
        </div>
      </div>

      {(data?.mine ?? []).length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 text-sm font-semibold">Your red packets</div>
          <div className="space-y-2">
            {data!.mine.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{p.code}</span>
                    <button onClick={() => { navigator.clipboard.writeText(p.code); toast.success("Copied"); }}><Copy className="h-3 w-3" /></button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">KES {Number(p.total_amount).toLocaleString()} · {p.claimed_count}/{p.max_claims} claimed · {p.ticket_value} tickets</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${p.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.claims ?? []).length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 text-sm font-semibold">Your claims</div>
          <div className="space-y-2 text-xs">
            {data!.claims.map((c: any) => (
              <div key={c.id} className="flex justify-between">
                <span>{c.red_packets?.code} · {c.tickets_awarded} ticket(s)</span>
                <span className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
