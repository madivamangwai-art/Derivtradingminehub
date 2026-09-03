import { createFileRoute } from "@tanstack/react-router";
import { markDepositSuccess } from "@/lib/payment-reconcile";

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
          const { data: dep } = await supabaseAdmin
            .from("deposits")
            .select("*")
            .eq("checkout_request_id", checkoutId)
            .maybeSingle();
          if (!dep) return Response.json({ ok: true });
          if (dep.status !== "pending") return Response.json({ ok: true });

          const normalizedResultCode = String(resultCode ?? "").trim();
          if (normalizedResultCode === "0" || normalizedResultCode.toLowerCase() === "success") {
            const items = (stk.CallbackMetadata?.Item ?? []) as Array<{ Name: string; Value: any }>;
            const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
              string | undefined;
            const paidAmount = Number(items.find((i) => i.Name === "Amount")?.Value ?? dep.amount);
            const creditAmount = Number(dep.amount);

            await markDepositSuccess(supabaseAdmin, {
              userId: dep.user_id,
              depositId: dep.id,
              amount: creditAmount,
              receipt,
              metadata: {
                ...(typeof dep.metadata === "object" && dep.metadata ? dep.metadata : {}),
                callback: payload,
                paid_amount: paidAmount,
              },
              description: `M-Pesa ${receipt ?? ""}`.trim(),
            });
          } else {
            await supabaseAdmin
              .from("deposits")
              .update({
                status: "failed",
                metadata: payload,
              })
              .eq("id", dep.id);
          }
        } catch (e) {
          console.error("mpesa callback err", e);
        }
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
