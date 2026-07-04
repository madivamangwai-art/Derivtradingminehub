import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        try {
          const stk = payload?.Body?.stkCallback;
          if (!stk) return Response.json({ ok: true });
          const checkoutId = stk.CheckoutRequestID as string | undefined;
          const resultCode = stk.ResultCode;
          if (!checkoutId) return Response.json({ ok: true });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: dep } = await supabaseAdmin.from("deposits").select("*").eq("checkout_request_id", checkoutId).maybeSingle();
          if (!dep) return Response.json({ ok: true });
          if (dep.status !== "pending") return Response.json({ ok: true });

          if (resultCode === 0) {
            const items = (stk.CallbackMetadata?.Item ?? []) as Array<{ Name: string; Value: any }>;
            const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as string | undefined;
            const amount = Number(items.find((i) => i.Name === "Amount")?.Value ?? dep.amount);

            await supabaseAdmin.from("deposits").update({
              status: "success", mpesa_receipt: receipt, amount, metadata: payload,
            }).eq("id", dep.id);

            const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", dep.user_id).maybeSingle();
            if (w) {
              await supabaseAdmin.from("wallets").update({
                balance: Number(w.balance) + amount,
                total_deposited: Number(w.total_deposited) + amount,
              }).eq("user_id", dep.user_id);
              await supabaseAdmin.from("transactions").insert({
                user_id: dep.user_id, kind: "deposit", amount, description: `M-Pesa ${receipt ?? ""}`.trim(), ref_id: dep.id,
              });
            }
          } else {
            await supabaseAdmin.from("deposits").update({
              status: "failed",
              metadata: payload,
            }).eq("id", dep.id);
          }
        } catch (e) {
          console.error("mpesa callback err", e);
        }
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

