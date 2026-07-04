import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// 13-slot wheel per tier. First 10 slots are the deterministic pattern
// that repeats: 0.5x, FREE, 2x, 0, 0, 1x, 0, 0.5x, 1x, 2x.
// Slots 10-12 (3x, 5x, 10x) are jackpots only reached via rare random bonus.
const PATTERN: Array<{ label: string; mult: number; free?: boolean }> = [
  { label: "0.5x", mult: 0.5 },
  { label: "FREE", mult: 0, free: true },
  { label: "2x", mult: 2 },
  { label: "0", mult: 0 },
  { label: "0", mult: 0 },
  { label: "1x", mult: 1 },
  { label: "0", mult: 0 },
  { label: "0.5x", mult: 0.5 },
  { label: "1x", mult: 1 },
  { label: "2x", mult: 2 },
];
const JACKPOTS: Array<{ label: string; mult: number; free?: boolean }> = [
  { label: "3x", mult: 3 },
  { label: "5x", mult: 5 },
  { label: "10x", mult: 10 },
];
const WHEEL = [...PATTERN, ...JACKPOTS];
const WHEELS: Record<number, typeof WHEEL> = { 50: WHEEL, 100: WHEEL, 500: WHEEL, 1000: WHEEL };

export const TICKET_VALUES = [50, 100, 500, 1000];

export const getSpinData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [tickets, history] = await Promise.all([
      supabase.from("spin_tickets").select("id,value_kes,source,created_at").eq("user_id", userId).is("used_at", null).order("created_at"),
      supabase.from("spin_tickets").select("value_kes,prize_amount,prize_label,used_at").eq("user_id", userId).not("used_at", "is", null).order("used_at", { ascending: false }).limit(20),
    ]);
    const counts: Record<number, number> = { 50: 0, 100: 0, 500: 0, 1000: 0 };
    (tickets.data ?? []).forEach((t) => { counts[t.value_kes] = (counts[t.value_kes] ?? 0) + 1; });
    return { ticketCounts: counts, tickets: tickets.data ?? [], history: history.data ?? [], wheels: WHEELS };
  });

export const buyTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: number; qty: number }) =>
    z.object({ value: z.number().int().refine((v) => TICKET_VALUES.includes(v)), qty: z.number().int().min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cost = data.value * data.qty;
    const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!w || Number(w.balance) < cost) throw new Error("Insufficient wallet balance");
    await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) - cost }).eq("user_id", userId);
    const rows = Array.from({ length: data.qty }, () => ({ user_id: userId, value_kes: data.value, source: "purchase" as const }));
    await supabaseAdmin.from("spin_tickets").insert(rows);
    await supabaseAdmin.from("transactions").insert({ user_id: userId, kind: "spin_ticket", amount: -cost, description: `Bought ${data.qty} x ${data.value} spin ticket(s)` });
    return { ok: true };
  });

export const spinTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: number }) => z.object({ value: z.number().int().refine((v) => TICKET_VALUES.includes(v)) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin.from("spin_tickets")
      .select("*").eq("user_id", userId).eq("value_kes", data.value).is("used_at", null)
      .order("created_at").limit(1).maybeSingle();
    if (!t) throw new Error("No tickets available");

    // Deterministic pattern index based on how many spins this user has already resolved at this tier
    const { count: usedCount } = await supabaseAdmin.from("spin_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("value_kes", data.value).not("used_at", "is", null);
    const patternIdx = (usedCount ?? 0) % PATTERN.length;

    // Rare jackpot roll: ~1/1000 for 10x (monthly-ish), ~1/300 for 5x, ~1/200 for 3x
    let idx = patternIdx;
    const roll = Math.random();
    if (roll < 0.001) idx = PATTERN.length + 2;        // 10x
    else if (roll < 0.001 + 1 / 300) idx = PATTERN.length + 1; // 5x
    else if (roll < 0.001 + 1 / 300 + 1 / 200) idx = PATTERN.length; // 3x

    const slot = WHEEL[idx];
    const prize = Math.floor(slot.mult * data.value);
    await supabaseAdmin.from("spin_tickets").update({
      used_at: new Date().toISOString(), prize_amount: prize, prize_label: slot.label,
    }).eq("id", t.id);
    if (slot.free) {
      await supabaseAdmin.from("spin_tickets").insert({ user_id: userId, value_kes: data.value, source: "free_spin" });
    }
    if (prize > 0) {
      const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
      if (w) {
        await supabaseAdmin.from("wallets").update({
          balance: Number(w.balance) + prize, total_earned: Number(w.total_earned) + prize,
        }).eq("user_id", userId);
        await supabaseAdmin.from("transactions").insert({ user_id: userId, kind: "spin_win", amount: prize, description: `Spin win (${slot.label} on ${data.value})` });
      }
    }
    return { slotIndex: idx, label: slot.label, prize, free: !!slot.free };
  });
