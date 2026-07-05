import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/payout/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        try {
          const resultCode = payload?.Result?.ResultCode ?? payload?.Body?.stkCallback?.ResultCode;
          const resultDesc = payload?.Result?.ResultDesc ?? payload?.Body?.stkCallback?.ResultDesc;
          const conversationId = payload?.ConversationID ?? payload?.Result?.ConversationID;
          const originatorConversationId = payload?.OriginatorConversationID ?? payload?.Result?.OriginatorConversationID;
          const transactionId = payload?.TransactionID ?? payload?.Result?.TransactionID;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let query = supabaseAdmin.from("withdrawals").select("*").eq("status", "processing");
          if (conversationId) query = query.or(`conversation_id.eq.${conversationId},originator_conversation_id.eq.${conversationId}`);
          if (originatorConversationId) query = query.or(`conversation_id.eq.${originatorConversationId},originator_conversation_id.eq.${originatorConversationId}`);
          const { data: wds } = await query;
          const wd = (wds ?? [])[0];
          if (!wd) return Response.json({ ok: true });

          if (String(resultCode) === "0") {
            const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", wd.user_id).maybeSingle();
            if (w) {
              await supabaseAdmin.from("wallets").update({
                balance: Number(w.balance) - Number(wd.amount),
                total_withdrawn: Number(w.total_withdrawn ?? 0) + Number(wd.amount),
              }).eq("user_id", wd.user_id);
            }
            await supabaseAdmin.from("withdrawals").update({
              status: "success",
              admin_note: resultDesc ? String(resultDesc) : "Payout completed.",
              provider_reference: transactionId ?? conversationId ?? null,
              metadata: payload,
            }).eq("id", wd.id);
            await supabaseAdmin.from("transactions").insert({
              user_id: wd.user_id, kind: "withdrawal", amount: -Number(wd.amount), description: "Withdrawal completed", ref_id: wd.id,
            });
          } else {
            await supabaseAdmin.from("withdrawals").update({
              status: "failed",
              admin_note: resultDesc ? String(resultDesc) : "Payout failed.",
              provider_reference: transactionId ?? conversationId ?? null,
              metadata: payload,
            }).eq("id", wd.id);
          }
        } catch (e) {
          console.error("mpesa payout callback err", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
