import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
  return supabaseAdmin;
}

export const adminListClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: profiles } = await admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
    const ids = (profiles ?? []).map((p) => p.id);
    if (!ids.length) return [];
    const [{ data: wallets }, { data: pkgs }] = await Promise.all([
      admin.from("wallets").select("*").in("user_id", ids),
      admin.from("user_packages").select("*, packages(name,tier,price,daily_payout)").in("user_id", ids).order("purchased_at", { ascending: false }),
    ]);
    const walletMap = new Map((wallets ?? []).map((w) => [w.user_id, w]));
    const pkgMap = new Map<string, typeof pkgs>();
    (pkgs ?? []).forEach((p) => {
      const list = pkgMap.get(p.user_id) ?? [];
      list.push(p);
      pkgMap.set(p.user_id, list);
    });
    return (profiles ?? []).map((p) => ({
      ...p,
      wallet: walletMap.get(p.id) ?? null,
      packages: pkgMap.get(p.id) ?? [],
    }));
  });

export const adminListDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: deposits } = await admin.from("deposits").select("*").order("created_at", { ascending: false }).limit(200);
    const ids = [...new Set((deposits ?? []).map((d) => d.user_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,email,phone").in("id", ids) : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (deposits ?? []).map((d) => ({ ...d, profile: map.get(d.user_id) ?? null }));
  });

export const adminApproveDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deposit_id: string; approve: boolean }) => z.object({ deposit_id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: dep } = await admin.from("deposits").select("*").eq("id", data.deposit_id).maybeSingle();
    if (!dep) throw new Error("Not found");
    if (dep.status !== "pending") throw new Error("Already processed");
    if (data.approve) {
      const { data: w } = await admin.from("wallets").select("*").eq("user_id", dep.user_id).maybeSingle();
      if (w) {
        await admin.from("wallets").update({
          balance: Number(w.balance) + Number(dep.amount),
          total_deposited: Number(w.total_deposited) + Number(dep.amount),
        }).eq("user_id", dep.user_id);
        await admin.from("transactions").insert({ user_id: dep.user_id, kind: "deposit", amount: Number(dep.amount), description: "Deposit approved", ref_id: dep.id });
      }
      await admin.from("deposits").update({ status: "success" }).eq("id", dep.id);
    } else {
      await admin.from("deposits").update({ status: "failed" }).eq("id", dep.id);
    }
    return { ok: true };
  });

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: wds } = await admin.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(200);
    const ids = [...new Set((wds ?? []).map((d) => d.user_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,email,phone").in("id", ids) : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (wds ?? []).map((d) => ({ ...d, profile: map.get(d.user_id) ?? null }));
  });

export const adminUpdateWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "approved" | "rejected" | "paid"; note?: string }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected", "paid"]), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: wd } = await admin.from("withdrawals").select("*").eq("id", data.id).maybeSingle();
    if (!wd) throw new Error("Not found");

    if (data.status === "paid" && wd.status !== "paid") {
      // deduct wallet
      const { data: w } = await admin.from("wallets").select("*").eq("user_id", wd.user_id).maybeSingle();
      if (w && Number(w.balance) >= Number(wd.amount)) {
        await admin.from("wallets").update({
          balance: Number(w.balance) - Number(wd.amount),
          total_withdrawn: Number(w.total_withdrawn) + Number(wd.amount),
        }).eq("user_id", wd.user_id);
        await admin.from("transactions").insert({ user_id: wd.user_id, kind: "withdrawal", amount: -Number(wd.amount), description: "Withdrawal paid", ref_id: wd.id });
      } else {
        throw new Error("Client wallet has insufficient balance");
      }
    }
    await admin.from("withdrawals").update({ status: data.status, admin_note: data.note }).eq("id", data.id);
    return { ok: true };
  });

export const adminGetSupport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const [{ data: settings }, { data: msgs }] = await Promise.all([
      admin.from("support_settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("support_messages").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    const ids = [...new Set((msgs ?? []).map((m) => m.user_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return { settings, threads: (msgs ?? []).map((m) => ({ ...m, profile: map.get(m.user_id) })) };
  });

export const adminUpdateSupportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { whatsapp_url?: string; telegram_url?: string }) =>
    z.object({ whatsapp_url: z.string().url().or(z.literal("")).optional(), telegram_url: z.string().url().or(z.literal("")).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await admin.from("support_settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    return { ok: true };
  });

export const adminReplySupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; message: string }) =>
    z.object({ user_id: z.string().uuid(), message: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await admin.from("support_messages").insert({ user_id: data.user_id, sender: "admin", message: data.message });
    return { ok: true };
  });

export const adminGetTeamTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: profiles } = await admin.from("profiles").select("id, full_name, email, referral_code, referred_by").limit(2000);
    return profiles ?? [];
  });

export const adminGetPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data } = await admin.from("packages").select("*").order("sort_order");
    return data ?? [];
  });

export const adminUpsertPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; code: string; name: string; tier: "bronze"|"silver"|"gold"|"diamond"|"platinum";
    price: number; daily_payout: number; duration_days: number; referral_bonus: number; sort_order: number; active: boolean;
  }) => z.object({
    id: z.string().uuid().optional(),
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(80),
    tier: z.enum(["bronze","silver","gold","diamond","platinum"]),
    price: z.number().positive(),
    daily_payout: z.number().positive(),
    duration_days: z.number().int().positive(),
    referral_bonus: z.number().min(0),
    sort_order: z.number().int(),
    active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    if (data.id) {
      await admin.from("packages").update(data).eq("id", data.id);
    } else {
      const { id: _ignored, ...insert } = data;
      await admin.from("packages").insert(insert);
    }
    return { ok: true };
  });

export const adminPromote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "client"; grant: boolean }) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(["admin", "client"]), grant: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    if (data.grant) {
      await admin.from("user_roles").upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await admin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    }
    return { ok: true };
  });

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; amount: number; note?: string }) =>
    z.object({ user_id: z.string().uuid(), amount: z.number().refine((v) => v !== 0), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: w } = await admin.from("wallets").select("*").eq("user_id", data.user_id).maybeSingle();
    if (!w) throw new Error("Wallet not found");
    const newBal = Number(w.balance) + data.amount;
    if (newBal < 0) throw new Error("Adjustment would put balance below zero");
    const isCredit = data.amount >= 0;
    if (isCredit) {
      await admin.from("wallets").update({ balance: newBal, total_deposited: Number(w.total_deposited) + data.amount }).eq("user_id", data.user_id);
    } else {
      await admin.from("wallets").update({ balance: newBal, total_withdrawn: Number(w.total_withdrawn) + Math.abs(data.amount) }).eq("user_id", data.user_id);
    }
    await admin.from("transactions").insert({
      user_id: data.user_id,
      kind: isCredit ? "deposit" : "withdrawal",
      amount: data.amount,
      description: data.note || (isCredit ? "M-Pesa deposit" : "M-Pesa withdrawal"),
    });
    return { ok: true, new_balance: newBal };
  });

export const adminListRedPackets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: packets } = await admin.from("red_packets").select("*").order("created_at", { ascending: false }).limit(200);
    const ids = [...new Set((packets ?? []).map((p) => p.creator_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (packets ?? []).map((p) => ({ ...p, creator: map.get(p.creator_id) ?? null }));
  });

export const adminListSpins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: tickets } = await admin.from("spin_tickets").select("*").order("created_at", { ascending: false }).limit(300);
    const ids = [...new Set((tickets ?? []).map((t) => t.user_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rows = (tickets ?? []).map((t) => ({ ...t, profile: map.get(t.user_id) ?? null }));
    const stats = {
      total: rows.length,
      spent: rows.reduce((s, r) => s + r.value_kes, 0),
      won: rows.reduce((s, r) => s + Number(r.prize_amount ?? 0), 0),
      played: rows.filter((r) => r.used_at).length,
    };
    return { rows, stats };
  });

export const adminGetAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const [wallets, withdrawals, tickets, deposits, txns30] = await Promise.all([
      admin.from("wallets").select("balance,total_deposited,total_withdrawn,total_earned"),
      admin.from("withdrawals").select("amount,fee,net_amount,status,created_at"),
      admin.from("spin_tickets").select("value_kes,prize_amount,used_at,created_at"),
      admin.from("deposits").select("amount,status,created_at"),
      admin.from("transactions").select("kind,amount,created_at").gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    ]);
    const sum = (rows: any[] | null, key: string) => (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

    const totalDeposited = sum(wallets.data as any, "total_deposited");
    const totalWithdrawn = sum(wallets.data as any, "total_withdrawn");
    const totalEarned = sum(wallets.data as any, "total_earned");
    const clientLiability = sum(wallets.data as any, "balance");
    const clientCount = (wallets.data ?? []).length;

    const wd = withdrawals.data ?? [];
    const feesCollectedPaid = wd.filter((w: any) => w.status === "paid").reduce((s: number, w: any) => s + Number(w.fee ?? 0), 0);
    const feesPending = wd.filter((w: any) => w.status !== "paid" && w.status !== "rejected").reduce((s: number, w: any) => s + Number(w.fee ?? 0), 0);
    const paidOutNet = wd.filter((w: any) => w.status === "paid").reduce((s: number, w: any) => s + Number(w.net_amount ?? (Number(w.amount) - Number(w.fee ?? 0))), 0);

    const tks = tickets.data ?? [];
    const spinSpent = tks.reduce((s: number, t: any) => s + Number(t.value_kes ?? 0), 0);
    const spinPaid = tks.filter((t: any) => t.used_at).reduce((s: number, t: any) => s + Number(t.prize_amount ?? 0), 0);
    const spinRetained = spinSpent - spinPaid;

    const successDeposits = (deposits.data ?? []).filter((d: any) => d.status === "success").reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);

    // 30-day averages from transactions
    const txn = txns30.data ?? [];
    const dep30 = txn.filter((t: any) => t.kind === "deposit").reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const wd30 = txn.filter((t: any) => t.kind === "withdrawal").reduce((s: number, t: any) => s + Math.abs(Number(t.amount ?? 0)), 0);
    const avgDailyWithdrawal = wd30 / 30;
    const avgDailyDeposit = dep30 / 30;
    const netDailyOutflow = Math.max(0, avgDailyWithdrawal - avgDailyDeposit);

    // House metrics
    // House balance = deposits + spin retained + fees - withdrawals paid to users
    const houseBalance = totalDeposited + spinRetained + feesCollectedPaid - totalWithdrawn;
    // Runway if all clients requested full withdrawal at net-daily-outflow pace
    const runwayDays = netDailyOutflow > 0 ? houseBalance / netDailyOutflow : null;
    // Coverage ratio: house cash vs client liability
    const coverageRatio = clientLiability > 0 ? houseBalance / clientLiability : null;

    return {
      totals: {
        totalDeposited,
        totalWithdrawn,
        totalEarned,
        clientLiability,
        clientCount,
        successDeposits,
        paidOutNet,
      },
      fees: { collected: feesCollectedPaid, pending: feesPending, rate: 0.05 },
      spin: { spent: spinSpent, paidOut: spinPaid, retained: spinRetained },
      house: { balance: houseBalance, runwayDays, coverageRatio },
      window30d: { deposits: dep30, withdrawals: wd30, avgDailyDeposit, avgDailyWithdrawal, netDailyOutflow },
    };
  });
