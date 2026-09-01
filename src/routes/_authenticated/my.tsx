import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateProfile, getSupportContext, getMyTeam } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { MessageCircle, Send, Copy, Users, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my")({ component: MyPage });

function MyPage() {
  const fn = useServerFn(getMyProfile);
  const supFn = useServerFn(getSupportContext);
  const teamFn = useServerFn(getMyTeam);
  const upd = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => fn() });
  const { data: sup } = useQuery({ queryKey: ["support-links"], queryFn: () => supFn() });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => teamFn() });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.full_name ?? "");
      setPhone(data.profile.phone ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => upd({ data: { full_name: name, phone } }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <ClientShell title="My account">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full gradient-gold text-lg font-bold">
            {(data?.profile?.full_name ?? data?.profile?.email ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{data?.profile?.full_name || "Set your name"}</div>
            <div className="text-xs text-muted-foreground">{data?.profile?.email}</div>
          </div>
          {data?.isAdmin && (
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              Admin
            </span>
          )}
        </div>
        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Referral code</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data?.profile?.referral_code ?? "");
                toast.success("Copied");
              }}
              className="flex items-center gap-1 font-semibold text-primary"
            >
              {data?.profile?.referral_code} <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Profile</h3>
        <div className="mt-3 space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="mt-4 glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">My team</h3>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {team?.directReferrals?.length ?? 0} direct
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TeamStat icon={Users} label="Trades" value={String((team?.directReferrals ?? []).reduce((sum: number, row: any) => sum + Number(row.trade_count ?? 0), 0))} />
          <TeamStat icon={TrendingUp} label="You earned" value={fmt(team?.totalEarned)} />
        </div>
        <div className="mt-3 space-y-2">
          {(team?.directReferrals ?? []).length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Your direct referrals will appear here after they sign up with your code.
            </div>
          )}
          {(team?.directReferrals ?? []).map((member: any) => (
            <div key={member.id} className="rounded-xl bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{member.full_name || member.email || "Unnamed client"}</div>
                  <div className="text-[11px] text-muted-foreground">Joined {new Date(member.created_at).toLocaleDateString()}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold text-success">+{fmt(member.earned_from_trades)}</div>
                  <div className="text-muted-foreground">income</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Trades" value={String(member.trade_count ?? 0)} />
                <Mini label="Traded" value={fmt(member.traded_amount)} />
                <Mini label="Profit" value={fmt(member.trade_profit)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Community & support</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={sup?.settings?.whatsapp_url || "#"}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white ${!sup?.settings?.whatsapp_url ? "opacity-50 pointer-events-none" : ""}`}
          >
            <MessageCircle className="h-4 w-4" /> Join WhatsApp
          </a>
          <a
            href={sup?.settings?.telegram_url || "#"}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center justify-center gap-2 rounded-lg bg-sky-500 py-2 text-xs font-semibold text-white ${!sup?.settings?.telegram_url ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Send className="h-4 w-4" /> Join Telegram
          </a>
        </div>
        <Link
          to="/my/support"
          className="mt-3 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Chat with support
          </span>{" "}
          →
        </Link>
      </div>
    </ClientShell>
  );
}

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function TeamStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-2 text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}
