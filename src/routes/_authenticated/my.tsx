import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateProfile, getSupportContext } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { MessageCircle, Send, ShieldCheck, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my")({ component: MyPage });

function MyPage() {
  const fn = useServerFn(getMyProfile);
  const supFn = useServerFn(getSupportContext);
  const upd = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => fn() });
  const { data: sup } = useQuery({ queryKey: ["support-links"], queryFn: () => supFn() });
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  useEffect(() => { if (data?.profile) { setName(data.profile.full_name ?? ""); setPhone(data.profile.phone ?? ""); } }, [data]);

  const save = useMutation({
    mutationFn: () => upd({ data: { full_name: name, phone } }),
    onSuccess: () => { toast.success("Profile updated"); qc.invalidateQueries({ queryKey: ["profile"] }); },
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
          {data?.isAdmin && <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Admin</span>}
        </div>
        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Referral code</span>
            <button
              onClick={() => { navigator.clipboard.writeText(data?.profile?.referral_code ?? ""); toast.success("Copied"); }}
              className="flex items-center gap-1 font-semibold text-primary"
            >
              {data?.profile?.referral_code} <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Admin panel access is gated behind 5 logo clicks on the Home page */}

      <div className="mt-4 glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Profile</h3>
        <div className="mt-3 space-y-3">
          <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} /></div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">{save.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      <div className="mt-4 glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Community & support</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={sup?.settings?.whatsapp_url || "#"} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white ${!sup?.settings?.whatsapp_url ? "opacity-50 pointer-events-none" : ""}`}>
            <MessageCircle className="h-4 w-4" /> Join WhatsApp
          </a>
          <a href={sup?.settings?.telegram_url || "#"} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-2 rounded-lg bg-sky-500 py-2 text-xs font-semibold text-white ${!sup?.settings?.telegram_url ? "opacity-50 pointer-events-none" : ""}`}>
            <Send className="h-4 w-4" /> Join Telegram
          </a>
        </div>
        <Link to="/my/support" className="mt-3 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Chat with support</span> →
        </Link>
      </div>
    </ClientShell>
  );
}
