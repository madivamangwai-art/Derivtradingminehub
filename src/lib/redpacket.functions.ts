import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genCode() {
  return "RP" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const getRedPacketData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [mine, claims] = await Promise.all([
      supabase
        .from("red_packets")
        .select("*")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("red_packet_claims")
        .select("*, red_packets(code, total_amount, max_claims)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { mine: mine.data ?? [], claims: claims.data ?? [] };
  });

export const createRedPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { total_amount: number; max_claims: number }) =>
    z
      .object({
        total_amount: z.number().int().min(100).max(1_000_000),
        max_claims: z.number().int().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const perClaim = Math.floor(data.total_amount / data.max_claims);
    if (perClaim < 1) throw new Error("Each claim must be worth at least KES 1");
    const code = genCode();
    const { data: rp, error } = await supabaseAdmin.rpc("create_red_packet_atomic", {
      _user_id: userId,
      _total_amount: data.total_amount,
      _max_claims: data.max_claims,
      _code: code,
    });
    if (error) throw error;
    return { code, id: rp.id };
  });

export const claimRedPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("claim_red_packet_atomic", {
      _user_id: userId,
      _code: data.code.toUpperCase(),
    });
    if (error) throw error;
    return result;
  });
