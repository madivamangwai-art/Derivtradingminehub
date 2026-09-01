import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Gift, Wallet } from "lucide-react";
import { getRedPacketData, createRedPacket, claimRedPacket } from "@/lib/redpacket.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/trade/redpacket")({
  component: RedPacketPage,
});

function RedPacketPage() {
  const dataFn = useServerFn(getRedPacketData);
  const createFn = useServerFn(createRedPacket);
  const claimFn = useServerFn(claimRedPacket);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["redpackets"], queryFn: () => dataFn() });

  const [amt, setAmt] = useState("1000");
  const [count, setCount] = useState("10");
  const [claimCode, setClaimCode] = useState("");
  const perClaim = Math.floor(Number(amt || 0) / Math.max(1, Number(count || 1)));

  const create = useMutation({
    mutationFn: async () =>
      createFn({ data: { total_amount: Number(amt), max_claims: Number(count) } }),
    onSuccess: (r) => {
      toast.success(`Red packet created: ${r.code}`);
      qc.invalidateQueries({ queryKey: ["redpackets"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const claim = useMutation({
    mutationFn: async () => claimFn({ data: { code: claimCode.trim().toUpperCase() } }),
    onSuccess: (r) => {
      toast.success(`Claimed KES ${Number(r.amount).toLocaleString()} to wallet`);
      setClaimCode("");
      qc.invalidateQueries({ queryKey: ["redpackets"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4 text-primary" /> Claim a red packet
        </div>
        <div className="flex gap-2">
          <Input
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
          />
          <Button onClick={() => claim.mutate()} disabled={claim.isPending || !claimCode}>
            Claim
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-success" /> Send wallet cash
        </div>
        <div className="space-y-3">
          <div>
            <Label>Total amount (KES, from your wallet)</Label>
            <Input
              type="number"
              min={100}
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
            />
          </div>
          <div>
            <Label>Number of claimers</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
            Each claimer gets{" "}
            <span className="font-semibold text-foreground">KES {perClaim.toLocaleString()}</span>{" "}
            credited directly to their wallet.
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || perClaim < 1}
            className="w-full gradient-gold"
          >
            {create.isPending
              ? "Creating..."
              : `Create and pay KES ${Number(amt).toLocaleString()}`}
          </Button>
        </div>
      </div>

      {(data?.mine ?? []).length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 text-sm font-semibold">Your red packets</div>
          <div className="space-y-2">
            {data!.mine.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{p.code}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(p.code);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    KES {Number(p.total_amount).toLocaleString()} - {p.claimed_count}/
                    {p.max_claims} claimed
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                    p.status === "active"
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.status}
                </span>
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
                <span>
                  {c.red_packets?.code} - KES {Number(c.amount_awarded ?? 0).toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
