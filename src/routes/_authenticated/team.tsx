import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTeam } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Users, TrendingUp, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/team")({ component: TeamPage });

const fmt = (n: any) => `KES ${Number(n ?? 0).toLocaleString()}`;

function TeamPage() {
  const fn = useServerFn(getMyTeam);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => fn() });
  const link = typeof window !== "undefined" && data?.referralCode
    ? `${window.location.origin}/auth?mode=signup&ref=${data.referralCode}`
    : "";
  const copy = () => { navigator.clipboard.writeText(link); toast.success("Referral link copied"); };
  const share = () => {
    if (navigator.share) navigator.share({ title: "Join MineHub", text: `Use my code ${data?.referralCode}`, url: link });
    else copy();
  };

  return (
    <ClientShell title="Team">
      <div className="glass-card rounded-2xl p-5 text-center">
        <div className="text-xs uppercase text-muted-foreground">Your referral code</div>
        <div className="mt-1 text-3xl font-bold tracking-widest text-primary">{data?.referralCode ?? "—"}</div>
        {link && (
          <div className="mt-4 flex justify-center">
            <div className="rounded-xl bg-white p-3"><QRCodeSVG value={link} size={128} /></div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 text-xs font-medium"><Copy className="h-4 w-4" /> Copy link</button>
          <button onClick={share} className="flex flex-1 items-center justify-center gap-2 rounded-lg gradient-gold py-2 text-xs font-semibold"><Share2 className="h-4 w-4" /> Share</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Card label="Direct" value={String(data?.directReferrals.length ?? 0)} icon={Users} />
        <Card label="Indirect" value={String(data?.indirectCount ?? 0)} icon={Users} />
        <Card label="Earned" value={fmt(data?.totalEarned)} icon={TrendingUp} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Your referrals</h2>
        {(data?.directReferrals ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Share your code to start earning.</div>
        ) : (
          <div className="space-y-2">
            {data?.directReferrals.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{r.full_name || r.email}</div>
                  <div className="text-[11px] text-muted-foreground">Joined {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Bonus history</h2>
        <div className="space-y-2">
          {(data?.earnings ?? []).length === 0 && <div className="text-sm text-muted-foreground">No earnings yet.</div>}
          {(data?.earnings ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{e.packages?.name ?? "Package"}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</div>
              </div>
              <div className="font-semibold text-success">+{fmt(e.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </ClientShell>
  );
}

function Card({ label, value, icon: Icon }: any) {
  return (
    <div className="glass-card rounded-xl p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-2 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
