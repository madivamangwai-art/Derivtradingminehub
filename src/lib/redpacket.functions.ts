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
      supabase.from("red_packets").select("*").eq("creator_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("red_packet_claims").select("*, red_packets(code, total_amount, max_claims)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    return { mine: mine.data ?? [], claims: claims.data ?? [] };
  });

export const createRedPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { total_amount: number; max_claims: number }) =>
    z.object({
      total_amount: z.number().int().min(100).max(1_000_000),
      max_claims: z.number().int().min(1).max(500),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const perClaim = Math.floor(data.total_amount / data.max_claims);
    if (perClaim < 1) throw new Error("Each claim must be worth at least KES 1");
    const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!w || Number(w.balance) < data.total_amount) throw new Error("Insufficient wallet balance");
    await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) - data.total_amount }).eq("user_id", userId);
    const code = genCode();
    const { data: rp, error } = await supabaseAdmin.from("red_packets").insert({
      creator_id: userId, code, total_amount: data.total_amount, max_claims: data.max_claims, ticket_value: perClaim,
    }).select().single();
    if (error) throw error;
    await supabaseAdmin.from("transactions").insert({ user_id: userId, kind: "red_packet_create", amount: -data.total_amount, description: `Created red packet ${code}`, ref_id: rp.id });
    return { code, id: rp.id };
  });

export const claimRedPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rp } = await supabaseAdmin.from("red_packets").select("*").eq("code", data.code.toUpperCase()).maybeSingle();
    if (!rp) throw new Error("Invalid code");
    if (rp.creator_id === userId) throw new Error("You cannot claim your own red packet");
    if (rp.status !== "active" || rp.claimed_count >= rp.max_claims) throw new Error("Red packet is fully claimed");
    const { data: existing } = await supabaseAdmin.from("red_packet_claims").select("id").eq("packet_id", rp.id).eq("user_id", userId).maybeSingle();
    if (existing) throw new Error("Already claimed");
    const perClaim = Math.floor(Number(rp.total_amount) / rp.max_claims);
    if (perClaim < 1) throw new Error("Nothing to claim");
    await supabaseAdmin.from("red_packet_claims").insert({
      packet_id: rp.id,
      user_id: userId,
      tickets_awarded: 0,
      amount_awarded: perClaim,
    });
    const newCount = rp.claimed_count + 1;
    await supabaseAdmin.from("red_packets").update({
      claimed_count: newCount,
      status: newCount >= rp.max_claims ? "completed" : "active",
    }).eq("id", rp.id);
    const { data: wallet } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (wallet) {
      await supabaseAdmin.from("wallets").update({
        balance: Number(wallet.balance) + perClaim,
        total_earned: Number(wallet.total_earned ?? 0) + perClaim,
      }).eq("user_id", userId);
    }
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      kind: "red_packet_claim",
      amount: perClaim,
      description: `Claimed red packet ${rp.code}`,
      ref_id: rp.id,
    });
    return { ok: true, amount: perClaim };
  });
