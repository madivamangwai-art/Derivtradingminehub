import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readEnvValue } from "@/lib/env";
import { buildWalletActivityItems } from "@/lib/payment-state";
import { initiateWithdrawalPayout, queryWithdrawalPayoutStatus } from "@/lib/mpesa.functions";

// ============ Client-facing server functions ============

// Claim schedule: package payouts unlock at 01:00 Africa/Nairobi (EAT, UTC+3) each day.
// A boundary at 01:00 EAT of EAT-day D is UTC timestamp D*86400e3 - 3600e3.
const EAT_OFFSET_MS = 3 * 3600 * 1000;
export function computePending(refIso: string, expiresIso: string, dailyPayout: number, nowMs = Date.now()) {
  const ref = new Date(refIso).getTime();
  const expires = new Date(expiresIso).getTime();
  const cap = Math.min(nowMs, expires);
  const eatDay = (t: number) => Math.floor((t + EAT_OFFSET_MS) / 86400000);
  const boundaryUTC = (D: number) => D * 86400000 - 3600000;
  let firstD = eatDay(ref);
  if (boundaryUTC(firstD) <= ref) firstD += 1;
  let lastD = eatDay(cap);
  if (boundaryUTC(lastD) > cap) lastD -= 1;
  if (lastD < firstD || cap <= ref) return { days: 0, amount: 0, lastBoundaryIso: refIso, nextBoundaryIso: new Date(boundaryUTC(firstD)).toISOString() };
  const days = lastD - firstD + 1;
  return {
    days,
    amount: days * Number(dailyPayout),
    lastBoundaryIso: new Date(boundaryUTC(lastD)).toISOString(),
    nextBoundaryIso: new Date(boundaryUTC(lastD + 1)).toISOString(),
  };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [wallet, profile, activePkgs, recentTxns, refCount] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_packages").select("*, packages(*)").eq("user_id", userId).eq("status", "active").order("purchased_at", { ascending: false }),
      supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId),
    ]);
    const withPending = (activePkgs.data ?? []).map((up: any) => {
      const p = computePending(up.last_payout_at ?? up.purchased_at, up.expires_at, Number(up.packages?.daily_payout ?? 0));
      return { ...up, pending: p };
    });
    return {
      wallet: wallet.data ?? { balance: 0, total_earned: 0, total_deposited: 0, total_withdrawn: 0 },
      profile: profile.data,
      activePackages: withPending,
      recentTransactions: recentTxns.data ?? [],
      referralCount: refCount.count ?? 0,
    };
  });

export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("packages").select("*").eq("active", true).order("sort_order");
    return data ?? [];
  });

export const getWalletData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await expireStalePendingWithdrawals(supabaseAdmin);
    const [wallet, deposits, withdrawals, txns] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("withdrawals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);
    const activity = buildWalletActivityItems(deposits.data ?? [], withdrawals.data ?? [], txns.data ?? []);
    return {
      wallet: wallet.data,
      deposits: deposits.data ?? [],
      withdrawals: withdrawals.data ?? [],
      transactions: txns.data ?? [],
      activity,
    };
  });

export const WITHDRAWAL_FEE_RATE = 0.05;
const STALE_WITHDRAWAL_HOURS = 24;

async function expireStalePendingWithdrawals(supabaseAdmin: any) {
  const cutoff = new Date(Date.now() - STALE_WITHDRAWAL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabaseAdmin.from("withdrawals")
    .select("id,user_id")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (!stale?.length) return 0;

  await Promise.all(stale.map((wd: any) =>
    supabaseAdmin.from("withdrawals").update({
      status: "failed",
      admin_note: `Auto-expired after ${STALE_WITHDRAWAL_HOURS} hours because no payout was confirmed.`,
    }).eq("id", wd.id)
  ));

  return stale.length;
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) =>
    z.object({ amount: z.number().min(1).max(1_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await expireStalePendingWithdrawals(supabaseAdmin);
    const { data: prof } = await supabaseAdmin.from("profiles").select("phone").eq("id", userId).maybeSingle();
    if (!prof?.phone) throw new Error("Please set your phone number in the My tab first.");
    const { data: wallet } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!wallet || Number(wallet.balance) < data.amount) throw new Error("Insufficient balance");
    const fee = Math.round(data.amount * 0.05 * 100) / 100;
    const net = Math.round((data.amount - fee) * 100) / 100;

    const { data: wd, error } = await supabaseAdmin.from("withdrawals").insert({
      user_id: userId, amount: data.amount, fee, net_amount: net,
      mpesa_phone: prof.phone, status: "pending",
    }).select().single();
    if (error) throw error;

    try {
      const payout = await initiateWithdrawalPayout({ phone: prof.phone, amount: Number(data.amount), withdrawalId: wd.id });
      const conversationId = payout?.ConversationID ?? null;
      const originatorConversationId = payout?.OriginatorConversationID ?? null;
      await supabaseAdmin.from("withdrawals").update({
        status: "processing",
        admin_note: payout?.ResponseDescription ? String(payout.ResponseDescription) : "Payout request sent to M-Pesa.",
        conversation_id: conversationId,
        originator_conversation_id: originatorConversationId,
        provider_reference: conversationId ?? payout?.OriginatorConversationID ?? null,
      }).eq("id", wd.id);

      const deadline = Date.now() + 45_000;
      let finalStatus = "processing" as "processing" | "success" | "failed";
      let statusResponse: { status: "processing" | "success" | "failed"; responseDescription?: string } | undefined;
      while (Date.now() < deadline) {
        statusResponse = await queryWithdrawalPayoutStatus({
          phone: prof.phone,
          shortcode: readEnvValue('MPESA_B2C_SHORTCODE', 'DARAJA_B2C_SHORTCODE', 'MPESA_SHORTCODE') ?? '',
          initiatorName: readEnvValue('MPESA_B2C_INITIATOR_NAME', 'DARAJA_B2C_INITIATOR_NAME', 'MPESA_INITIATOR_NAME') ?? '',
          securityCredential: readEnvValue('MPESA_B2C_SECURITY_CREDENTIAL', 'DARAJA_B2C_SECURITY_CREDENTIAL', 'MPESA_SECURITY_CREDENTIAL') ?? '',
          conversationId: conversationId ?? undefined,
          originatorConversationId: originatorConversationId ?? undefined,
        });
        if (statusResponse.status === "success") {
          finalStatus = "success";
          break;
        }
        if (statusResponse.status === "failed") {
          finalStatus = "failed";
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (finalStatus === "success") {
          const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
          if (w) {
            await supabaseAdmin.from("wallets").update({
              balance: Number(w.balance) - Number(data.amount),
              total_withdrawn: Number(w.total_withdrawn ?? 0) + Number(data.amount),
            }).eq("user_id", userId);
          }
          await supabaseAdmin.from("withdrawals").update({
            status: "success",
            admin_note: "Payout confirmed by M-Pesa.",
          }).eq("id", wd.id);
          await supabaseAdmin.from("transactions").insert({
            user_id: userId, kind: "withdrawal", amount: -Number(data.amount), description: "Withdrawal completed", ref_id: wd.id,
          });
          return { ok: true, fee, net, status: "success" };
        }
      if (finalStatus === "failed") {
        await supabaseAdmin.from("withdrawals").update({ status: "failed", admin_note: statusResponse?.responseDescription ?? "Payout failed" }).eq("id", wd.id);
        throw new Error(statusResponse?.responseDescription || "Payout failed");
      }
      return { ok: true, fee, net, status: "processing" };
    } catch (payoutError) {
      const message = payoutError instanceof Error ? payoutError.message : String(payoutError);
      await supabaseAdmin.from("withdrawals").update({ status: "failed", admin_note: message }).eq("id", wd.id);
      throw new Error(message);
    }
  });

export const purchasePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { package_id: string }) => z.object({ package_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkg } = await supabaseAdmin.from("packages").select("*").eq("id", data.package_id).eq("active", true).maybeSingle();
    if (!pkg) throw new Error("Package unavailable");
    const { data: wallet } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!wallet || Number(wallet.balance) < Number(pkg.price)) throw new Error("Insufficient wallet balance. Deposit first.");

    const newBalance = Number(wallet.balance) - Number(pkg.price);
    const expiresAt = new Date(Date.now() + pkg.duration_days * 24 * 3600 * 1000).toISOString();

    const { data: up, error: upErr } = await supabaseAdmin.from("user_packages").insert({
      user_id: userId, package_id: pkg.id, expires_at: expiresAt,
    }).select().single();
    if (upErr) throw upErr;

    await supabaseAdmin.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
    await supabaseAdmin.from("transactions").insert({
      user_id: userId, kind: "purchase", amount: -Number(pkg.price), description: `Purchased ${pkg.name}`, ref_id: up.id,
    });

    // Referral bonus (once per referrer + referred user + package tier)
    const { data: prof } = await supabaseAdmin.from("profiles").select("referred_by").eq("id", userId).maybeSingle();
    if (prof?.referred_by && Number(pkg.referral_bonus) > 0) {
      const { data: existing } = await supabaseAdmin.from("referral_earnings")
        .select("id").eq("referrer_id", prof.referred_by).eq("referred_user_id", userId).eq("package_id", pkg.id).maybeSingle();
      if (!existing) {
        const { error: refErr } = await supabaseAdmin.from("referral_earnings").insert({
          referrer_id: prof.referred_by, referred_user_id: userId, package_id: pkg.id,
          user_package_id: up.id, amount: Number(pkg.referral_bonus),
        });
        if (!refErr) {
          const { data: refWallet } = await supabaseAdmin.from("wallets").select("balance,total_earned").eq("user_id", prof.referred_by).maybeSingle();
          if (refWallet) {
            await supabaseAdmin.from("wallets").update({
              balance: Number(refWallet.balance) + Number(pkg.referral_bonus),
              total_earned: Number(refWallet.total_earned) + Number(pkg.referral_bonus),
            }).eq("user_id", prof.referred_by);
            await supabaseAdmin.from("transactions").insert({
              user_id: prof.referred_by, kind: "referral", amount: Number(pkg.referral_bonus),
              description: `Referral bonus (${pkg.name})`, ref_id: up.id,
            });
          }
        }
      }
    }
    return { ok: true };
  });

export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, direct, earnings] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle(),
      supabase.from("profiles").select("id, full_name, email, created_at").eq("referred_by", userId).order("created_at", { ascending: false }),
      supabase.from("referral_earnings").select("*, packages(name,tier)").eq("referrer_id", userId).order("created_at", { ascending: false }),
    ]);
    // 2nd-level indirect
    const directIds = (direct.data ?? []).map((d) => d.id);
    let indirect: Array<{ id: string; full_name: string | null }> = [];
    if (directIds.length) {
      const { data } = await supabase.from("profiles").select("id, full_name").in("referred_by", directIds);
      indirect = data ?? [];
    }
    const totalEarned = (earnings.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
    return {
      referralCode: profile.data?.referral_code ?? "",
      directReferrals: direct.data ?? [],
      indirectCount: indirect.length,
      earnings: earnings.data ?? [],
      totalEarned,
    };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, wallet, roles] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      profile: profile.data,
      wallet: wallet.data,
      isAdmin: (roles.data ?? []).some((r) => r.role === "admin"),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name?: string; phone?: string }) =>
    z.object({ full_name: z.string().max(80).optional(), phone: z.string().max(15).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getSupportContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [settings, messages] = await Promise.all([
      supabase.from("support_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("support_messages").select("*").eq("user_id", userId).order("created_at"),
    ]);
    return { settings: settings.data, messages: messages.data ?? [] };
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) => z.object({ message: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("support_messages").insert({ user_id: userId, sender: "user", message: data.message });
    if (error) throw error;
    return { ok: true };
  });

export const claimPackagePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_package_id: string }) => z.object({ user_package_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: up } = await supabaseAdmin.from("user_packages")
      .select("*, packages(*)").eq("id", data.user_package_id).eq("user_id", userId).maybeSingle();
    if (!up) throw new Error("Package not found");
    if (up.status !== "active") throw new Error("Package is no longer active");
    const pkg: any = up.packages;
    const ref = up.last_payout_at ?? up.purchased_at;
    const pend = computePending(ref, up.expires_at, Number(pkg.daily_payout));
    if (pend.amount <= 0) throw new Error("Nothing to claim yet. Come back after 01:00.");

    const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (!w) throw new Error("Wallet missing");
    await supabaseAdmin.from("wallets").update({
      balance: Number(w.balance) + pend.amount,
      total_earned: Number(w.total_earned) + pend.amount,
    }).eq("user_id", userId);
    const nowMs = Date.now();
    const packageDone = new Date(up.expires_at).getTime() <= nowMs;
    await supabaseAdmin.from("user_packages").update({
      last_payout_at: pend.lastBoundaryIso,
      total_paid_out: Number(up.total_paid_out) + pend.amount,
      status: packageDone ? "completed" : "active",
    }).eq("id", up.id);
    await supabaseAdmin.from("transactions").insert({
      user_id: userId, kind: "payout", amount: pend.amount,
      description: `Claimed ${pend.days} day${pend.days > 1 ? "s" : ""} — ${pkg.name}`,
      ref_id: up.id,
    });
    return { ok: true, amount: pend.amount, days: pend.days };
  });
