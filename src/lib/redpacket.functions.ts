import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TICKET_VALUES = [50, 100, 500, 1000];

function genCode() {
  return "RP" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const getRedPacketData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [mine, claims] = await Promise.all([
      supabase.from("red_packets").select("*").eq("creator_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("red_packet_claims").select("*, red_packets(code, ticket_value, total_amount, max_claims)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    return { mine: mine.data ?? [], claims: claims.data ?? [] };
  });

export const createRedPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { total_amount: number; max_claims: number; ticket_value: number }) =>
    z.object({
      total_amount: z.number().int().min(100).max(1_000_000),
      max_claims: z.number().int().min(1).max(500),
      ticket_value: z.number().int().refine((v) => TICKET_VALUES.includes(v)),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const perClaim = Math.floor(data.total_amount / data.max_claims);
    if (perClaim < data.ticket_value) throw new Error(`Each claim must be worth at least one ticket (${data.ticket_value} KES)`);
    const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!w || Number(w.balance) < data.total_amount) throw new Error("Insufficient wallet balance");
    await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) - data.total_amount }).eq("user_id", userId);
    const code = genCode();
    const { data: rp, error } = await supabaseAdmin.from("red_packets").insert({
      creator_id: userId, code, total_amount: data.total_amount, max_claims: data.max_claims, ticket_value: data.ticket_value,
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
    const tickets = Math.floor(perClaim / rp.ticket_value);
    if (tickets < 1) throw new Error("Nothing to claim");
    await supabaseAdmin.from("red_packet_claims").insert({ packet_id: rp.id, user_id: userId, tickets_awarded: tickets });
    const newCount = rp.claimed_count + 1;
    await supabaseAdmin.from("red_packets").update({
      claimed_count: newCount,
      status: newCount >= rp.max_claims ? "completed" : "active",
    }).eq("id", rp.id);
    const rows = Array.from({ length: tickets }, () => ({ user_id: userId, value_kes: rp.ticket_value, source: "red_packet" as const }));
    await supabaseAdmin.from("spin_tickets").insert(rows);
    return { ok: true, tickets, ticket_value: rp.ticket_value };
  });
