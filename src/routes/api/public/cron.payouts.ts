import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/payouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const provided =
          request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
        if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { settleCopyTrades } = await import("@/lib/app.functions");
        const copyTradeSettlement = await settleCopyTrades(supabaseAdmin);
        const { data: settings } = await supabaseAdmin
          .from("treasury_settings")
          .select("payouts_frozen")
          .eq("id", 1)
          .maybeSingle();
        if (settings?.payouts_frozen)
          return Response.json({
            ok: true,
            frozen: true,
            completed: 0,
            copyTradesSettled: copyTradeSettlement.settled,
            expiredCopyTradeSignals: copyTradeSettlement.expiredSignals,
          });
        const now = new Date();
        const { data: active } = await supabaseAdmin
          .from("user_packages")
          .select("*, packages(*)")
          .eq("status", "active");

        // Payouts are now claimed manually by users from the Home page.
        // This job only marks expired packages as completed.
        let completed = 0;
        for (const up of active ?? []) {
          if (new Date(up.expires_at) <= now) {
            await supabaseAdmin
              .from("user_packages")
              .update({ status: "completed" })
              .eq("id", up.id);
            completed++;
          }
        }
        return Response.json({
          ok: true,
          completed,
          copyTradesSettled: copyTradeSettlement.settled,
          expiredCopyTradeSignals: copyTradeSettlement.expiredSignals,
        });
      },
    },
  },
});
