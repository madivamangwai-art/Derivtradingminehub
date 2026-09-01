import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupportContext, sendSupportMessage } from "@/lib/app.functions";
import { ClientShell } from "@/components/layout/client-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my/support")({ component: SupportChat });

function SupportChat() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSupportContext);
  const sendFn = useServerFn(sendSupportMessage);
  const { data } = useQuery({ queryKey: ["support-thread"], queryFn: () => getFn(), refetchInterval: 5000 });
  const [msg, setMsg] = useState("");
  const send = useMutation({
    mutationFn: () => sendFn({ data: { message: msg } }),
    onSuccess: () => { setMsg(""); qc.invalidateQueries({ queryKey: ["support-thread"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <ClientShell title="Support">
      <div className="glass-card flex h-[65vh] flex-col rounded-2xl p-4">
        <div className="flex-1 space-y-2 overflow-y-auto">
          {(data?.messages ?? []).length === 0 && <div className="grid h-full place-items-center text-sm text-muted-foreground">Send us a message and we'll get back to you.</div>}
          {(data?.messages ?? []).map((m: any) => (
            <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
              <div>{m.message}</div>
              <div className="mt-0.5 text-[10px] opacity-60">{new Date(m.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message…" rows={2} maxLength={1000} />
          <Button onClick={() => send.mutate()} disabled={!msg.trim() || send.isPending} className="gradient-gold">Send</Button>
        </div>
      </div>
    </ClientShell>
  );
}
