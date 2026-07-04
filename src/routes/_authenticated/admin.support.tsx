import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetSupport, adminUpdateSupportSettings, adminReplySupport } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/support")({ component: SupportAdmin });

function SupportAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetSupport);
  const setFn = useServerFn(adminUpdateSupportSettings);
  const replyFn = useServerFn(adminReplySupport);
  const { data } = useQuery({ queryKey: ["admin-support"], queryFn: () => getFn(), refetchInterval: 5000 });

  const [wa, setWa] = useState(""); const [tg, setTg] = useState("");
  useEffect(() => { if (data?.settings) { setWa(data.settings.whatsapp_url ?? ""); setTg(data.settings.telegram_url ?? ""); } }, [data?.settings]);

  const saveLinks = useMutation({
    mutationFn: () => setFn({ data: { whatsapp_url: wa, telegram_url: tg } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-support"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Group messages by user
  const threads = useMemo(() => {
    const map = new Map<string, any[]>();
    (data?.threads ?? []).forEach((m: any) => {
      const arr = map.get(m.user_id) ?? [];
      arr.push(m);
      map.set(m.user_id, arr);
    });
    return Array.from(map.entries()).map(([uid, msgs]) => ({
      user_id: uid,
      profile: msgs[0].profile,
      messages: [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      last: msgs[0].created_at,
    })).sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  }, [data]);

  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  useEffect(() => { if (!selected && threads[0]) setSelected(threads[0].user_id); }, [threads, selected]);

  const send = useMutation({
    mutationFn: () => replyFn({ data: { user_id: selected!, message: reply } }),
    onSuccess: () => { setReply(""); qc.invalidateQueries({ queryKey: ["admin-support"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const active = threads.find((t) => t.user_id === selected);

  return (
    <AdminShell title="Support">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-semibold">Community links (visible to clients)</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><Label>WhatsApp group URL</Label><Input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="https://chat.whatsapp.com/…" /></div>
          <div><Label>Telegram channel URL</Label><Input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="https://t.me/…" /></div>
        </div>
        <Button onClick={() => saveLinks.mutate()} disabled={saveLinks.isPending} className="mt-3">Save links</Button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="glass-card rounded-2xl p-2">
          <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Threads</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {threads.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No conversations.</div>}
            {threads.map((t) => (
              <button key={t.user_id} onClick={() => setSelected(t.user_id)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${selected === t.user_id ? "bg-primary/15" : "hover:bg-muted"}`}>
                <div className="font-medium">{t.profile?.full_name || t.profile?.email || t.user_id.slice(0,8)}</div>
                <div className="truncate text-[11px] text-muted-foreground">{t.messages[t.messages.length - 1]?.message}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="glass-card flex h-[65vh] flex-col rounded-2xl p-4">
          <div className="flex-1 space-y-2 overflow-y-auto">
            {(active?.messages ?? []).map((m: any) => (
              <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender === "admin" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
                <div>{m.message}</div>
                <div className="mt-0.5 text-[10px] opacity-60">{m.sender} · {new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
            {!active && <div className="grid h-full place-items-center text-sm text-muted-foreground">Select a conversation.</div>}
          </div>
          {active && (
            <div className="mt-3 flex gap-2">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" rows={2} maxLength={1000} />
              <Button onClick={() => send.mutate()} disabled={!reply.trim() || send.isPending} className="gradient-gold">Send</Button>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

