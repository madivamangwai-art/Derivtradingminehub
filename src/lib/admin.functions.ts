import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getPackageMaturityReturnRate,
  getPackagePayoutMode,
  settleCopyTrades,
} from "@/lib/app.functions";
import { markDepositSuccess, markWithdrawalSuccess } from "@/lib/payment-reconcile";

type CopyTradeType = "daily" | "locked7" | "locked30";
type AnalystInput = {
  id?: string;
  name: string;
  title: string;
  avatar_url?: string;
  bio: string;
  one_day_return_rate: number;
  seven_day_roi: number;
  follow_period_days?: number | null;
  commission_rate: number;
  min_copy_amount: number;
  max_copy_amount?: number | null;
  active: boolean;
  sort_order: number;
};

const COPY_TRADE_PROFIT_RATE = 0.15;
const ANALYST_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

async function ensureAnalystAvatarBucket(admin: any) {
  const { error } = await admin.storage.createBucket("profile-avatars", {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: [...ANALYST_AVATAR_MIME_TYPES],
  });
  if (error && !/already exists|duplicate/i.test(error.message ?? "")) throw error;
  if (error) {
    await admin.storage.updateBucket("profile-avatars", {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: [...ANALYST_AVATAR_MIME_TYPES],
    });
  }
}

function analystAvatarExt(fileName: string, mimeType: string) {
  const fromName = fileName
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function generateSignalCode(type: CopyTradeType) {
  const prefix = type === "daily" ? "DT" : type === "locked7" ? "L7" : "L30";
  return `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeRate(value: number) {
  return value > 1 ? value / 100 : value;
}

function money(amount: number) {
  return Math.round(Number(amount) * 100) / 100;
}

function getSignalDurationMs(type: CopyTradeType) {
  if (type === "daily") return 30 * 60 * 1000;
  if (type === "locked7") return 7 * 24 * 3600 * 1000;
  return 30 * 24 * 3600 * 1000;
}

function getCopyTradeRemainingDays(trade: any, nowMs = Date.now()) {
  if (trade.trade_type === "daily") return 1;
  return Math.max(1, Math.ceil((new Date(trade.closes_at).getTime() - nowMs) / 86400000));
}

function getCopyTradeProfitRemaining(trade: any, nowMs = Date.now()) {
  const principal = Number(trade.amount ?? 0);
  const rate = Number(trade.profit_rate ?? COPY_TRADE_PROFIT_RATE);
  return principal * rate * getCopyTradeRemainingDays(trade, nowMs);
}

function getCopyTradeDailyAccrual(trade: any) {
  if (trade.trade_type === "daily") return 0;
  return Number(trade.amount ?? 0) * Number(trade.profit_rate ?? COPY_TRADE_PROFIT_RATE);
}

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return supabaseAdmin;
}

export const adminListClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: profiles } = await admin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = (profiles ?? []).map((p) => p.id);
    if (!ids.length) return [];
    const [{ data: wallets }, { data: trades }] = await Promise.all([
      admin.from("wallets").select("*").in("user_id", ids),
      admin
        .from("copy_trades")
        .select("*")
        .in("user_id", ids)
        .order("opened_at", { ascending: false }),
    ]);
    const walletMap = new Map((wallets ?? []).map((w) => [w.user_id, w]));
    const tradeMap = new Map<string, typeof trades>();
    (trades ?? []).forEach((trade) => {
      const list = tradeMap.get(trade.user_id) ?? [];
      list.push(trade);
      tradeMap.set(trade.user_id, list);
    });
    return (profiles ?? []).map((p) => ({
      ...p,
      wallet: walletMap.get(p.id) ?? null,
      trades: tradeMap.get(p.id) ?? [],
    }));
  });

export const adminListDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: deposits } = await admin
      .from("deposits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((deposits ?? []).map((d) => d.user_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email,phone").in("id", ids)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (deposits ?? []).map((d) => ({ ...d, profile: map.get(d.user_id) ?? null }));
  });

export const adminApproveDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deposit_id: string; approve: boolean }) =>
    z.object({ deposit_id: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: dep } = await admin
      .from("deposits")
      .select("*")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (!dep) throw new Error("Not found");
    if (dep.status !== "pending") throw new Error("Already processed");
    if (data.approve) {
      await markDepositSuccess(admin, {
        userId: dep.user_id,
        depositId: dep.id,
        amount: Number(dep.amount),
        receipt: dep.mpesa_receipt ?? null,
        metadata: dep.metadata ?? null,
        description: "Deposit approved",
      });
    } else {
      await admin.from("deposits").update({ status: "failed" }).eq("id", dep.id);
    }
    return { ok: true };
  });

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: wds } = await admin
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((wds ?? []).map((d) => d.user_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email,phone").in("id", ids)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (wds ?? []).map((d) => ({ ...d, profile: map.get(d.user_id) ?? null }));
  });

export const adminUpdateWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "approved" | "rejected" | "paid"; note?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected", "paid"]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: wd } = await admin
      .from("withdrawals")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!wd) throw new Error("Not found");

    if (data.status === "paid" && wd.status !== "paid") {
      await markWithdrawalSuccess(admin, {
        userId: wd.user_id,
        withdrawalId: wd.id,
        amount: Number(wd.amount),
        metadata: wd.metadata ?? null,
        providerReference: wd.provider_reference ?? null,
        resultDesc: data.note || "Withdrawal paid",
      });
    }
    await admin
      .from("withdrawals")
      .update({ status: data.status, admin_note: data.note })
      .eq("id", data.id);
    return { ok: true };
  });

export const adminGetSupport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const [{ data: settings }, { data: msgs }] = await Promise.all([
      admin.from("support_settings").select("*").eq("id", 1).maybeSingle(),
      admin
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const ids = [...new Set((msgs ?? []).map((m) => m.user_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return { settings, threads: (msgs ?? []).map((m) => ({ ...m, profile: map.get(m.user_id) })) };
  });

export const adminUpdateSupportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { whatsapp_url?: string; telegram_url?: string }) =>
    z
      .object({
        whatsapp_url: z.string().url().or(z.literal("")).optional(),
        telegram_url: z.string().url().or(z.literal("")).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await admin
      .from("support_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return { ok: true };
  });

export const adminReplySupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; message: string }) =>
    z.object({ user_id: z.string().uuid(), message: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await admin
      .from("support_messages")
      .insert({ user_id: data.user_id, sender: "admin", message: data.message });
    return { ok: true };
  });

export const adminGetTeamTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email, referral_code, referred_by")
      .limit(2000);
    return profiles ?? [];
  });

export const adminGetPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data } = await admin.from("packages").select("*").order("sort_order");
    return data ?? [];
  });

export const adminListPackagePurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: purchases } = await admin
      .from("user_packages")
      .select("*, packages(*)")
      .order("purchased_at", { ascending: false })
      .limit(500);
    const userIds = [...new Set((purchases ?? []).map((p) => p.user_id))];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id,full_name,email,phone").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const now = Date.now();

    return (purchases ?? []).map((p: any) => {
      const expiresAt = new Date(p.expires_at);
      const expired = expiresAt.getTime() <= now;
      const realStatus = p.status === "active" && expired ? "depleted" : p.status;
      const remainingDays =
        p.status === "active" && !expired
          ? Math.ceil((expiresAt.getTime() - now) / (24 * 3600 * 1000))
          : 0;

      return {
        ...p,
        profile: profileMap.get(p.user_id) ?? null,
        real_status: realStatus,
        remaining_days: remainingDays,
        counts_expected_outflow: p.status === "active" && !expired,
      };
    });
  });

export const adminGetCopyTrading = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    await settleCopyTrades(admin);
    const [signalsRes, tradesRes, analystsRes] = await Promise.all([
      admin
        .from("copy_trade_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("copy_trades").select("*").order("opened_at", { ascending: false }).limit(500),
      admin
        .from("copy_trade_analysts")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    const trades = tradesRes.data ?? [];
    const userIds = [...new Set(trades.map((t: any) => t.user_id))];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id,full_name,email,phone").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const openDailyOutflow = trades
      .filter((t: any) => t.status === "open")
      .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0) * Number(t.profit_rate ?? 0), 0);

    return {
      signals: signalsRes.data ?? [],
      analysts: analystsRes.data ?? [],
      trades: trades.map((trade: any) => ({
        ...trade,
        profile: profileMap.get(trade.user_id) ?? null,
      })),
      summary: {
        openTrades: trades.filter((t: any) => t.status === "open").length,
        wonTrades: trades.filter((t: any) => t.status === "won").length,
        lostTrades: trades.filter((t: any) => t.status === "lost").length,
        openDailyOutflow,
      },
    };
  });

export const adminUpsertCopyTradeAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AnalystInput) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        title: z.string().min(1).max(80),
        avatar_url: z.string().max(500).optional().or(z.literal("")),
        bio: z.string().min(1).max(1200),
        one_day_return_rate: z.number().min(-1).max(10),
        seven_day_roi: z.number().min(-1).max(10),
        follow_period_days: z.number().int().positive().nullable().optional(),
        commission_rate: z.number().min(0).max(100),
        min_copy_amount: z.number().min(1).max(1_000_000),
        max_copy_amount: z.number().min(0).nullable().optional(),
        active: z.boolean(),
        sort_order: z.number().int(),
      })
      .refine(
        (value) =>
          value.max_copy_amount == null ||
          value.max_copy_amount === 0 ||
          value.max_copy_amount >= value.min_copy_amount,
        {
          message: "Maximum amount must be greater than the minimum amount.",
          path: ["max_copy_amount"],
        },
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const payload = {
      ...data,
      avatar_url: data.avatar_url || null,
      commission_rate: normalizeRate(data.commission_rate),
      min_copy_amount: money(data.min_copy_amount),
      max_copy_amount: data.max_copy_amount ? money(data.max_copy_amount) : null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { id: _id, ...update } = payload;
      const { error } = await admin.from("copy_trade_analysts").update(update).eq("id", data.id);
      if (error) throw error;
    } else {
      const { id: _id, ...insert } = payload;
      const { error } = await admin.from("copy_trade_analysts").insert(insert);
      if (error) throw error;
    }
    return { ok: true };
  });

export const adminUploadCopyTradeAnalystAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { file_name: string; mime_type: string; content_base64: string }) =>
    z
      .object({
        file_name: z.string().min(1).max(160),
        mime_type: z.enum(ANALYST_AVATAR_MIME_TYPES),
        content_base64: z.string().min(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await ensureAnalystAvatarBucket(admin);
    const { Buffer } = await import("node:buffer");
    const ext = analystAvatarExt(data.file_name, data.mime_type);
    const path = `analysts/avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await admin.storage
      .from("profile-avatars")
      .upload(path, Buffer.from(data.content_base64, "base64"), {
        contentType: data.mime_type,
        upsert: true,
      });
    if (error) throw error;
    const { data: publicUrl } = admin.storage.from("profile-avatars").getPublicUrl(path);
    return { avatar_url: publicUrl.publicUrl };
  });

export const adminDeleteCopyTradeAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { error } = await admin.from("copy_trade_analysts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminListKycVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: rows } = await admin
      .from("kyc_verifications")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(300);
    const userIds = [...new Set((rows ?? []).map((row: any) => row.user_id))];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id,full_name,email,phone,avatar_url").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const withUrls = await Promise.all(
      (rows ?? []).map(async (row: any) => {
        const [front, back, selfie] = await Promise.all(
          [row.id_front_path, row.id_back_path, row.selfie_path].map(async (path) => {
            const { data } = await admin.storage
              .from("kyc-documents")
              .createSignedUrl(path, 60 * 10);
            return data?.signedUrl ?? null;
          }),
        );
        return {
          ...row,
          profile: profileMap.get(row.user_id) ?? null,
          documents: { front, back, selfie },
        };
      }),
    );

    return withUrls;
  });

export const adminReviewKycVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "approved" | "rejected"; reason?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    if (data.status === "rejected" && !data.reason?.trim()) {
      throw new Error("Please write a rejection reason.");
    }
    const update = {
      status: data.status,
      rejection_reason: data.status === "rejected" ? data.reason?.trim() : null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    const { error } = await admin.from("kyc_verifications").update(update).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminGenerateCopyTradeSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trade_type: CopyTradeType; min_copy_amount?: number }) =>
    z
      .object({
        trade_type: z.enum(["daily", "locked7", "locked30"]),
        min_copy_amount: z.number().min(1).max(1_000_000).optional().default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getSignalDurationMs(data.trade_type));

    if (data.trade_type !== "daily") {
      const { data: active } = await admin
        .from("copy_trade_signals")
        .select("id")
        .eq("trade_type", data.trade_type)
        .eq("active", true)
        .gt("expires_at", now.toISOString())
        .limit(1)
        .maybeSingle();
      if (active) throw new Error("This locked signal already has an active code.");
    }

    const { data: signal, error } = await admin
      .from("copy_trade_signals")
      .insert({
        code: generateSignalCode(data.trade_type),
        trade_type: data.trade_type,
        profit_rate: COPY_TRADE_PROFIT_RATE,
        min_copy_amount: data.min_copy_amount,
        valid_from: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return signal;
  });

export const adminSetCopyTradeResultOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trade_id: string; result_override?: "win" | "loss" | null }) =>
    z
      .object({
        trade_id: z.string().uuid(),
        result_override: z.enum(["win", "loss"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: trade, error: tradeError } = await admin
      .from("copy_trades")
      .select("id,status")
      .eq("id", data.trade_id)
      .maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) throw new Error("Copy trade not found.");
    if (trade.status !== "open") throw new Error("Only active copy trades can be overridden.");

    const override = data.result_override ?? null;
    const { error } = await admin
      .from("copy_trades")
      .update({
        result_override: override,
        result_overridden_by: override ? context.userId : null,
        result_overridden_at: override ? new Date().toISOString() : null,
      })
      .eq("id", data.trade_id);
    if (error) throw error;
    return { ok: true, result_override: override };
  });

export const adminUpsertPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      code: string;
      name: string;
      tier: "bronze" | "silver" | "gold" | "diamond" | "platinum";
      price: number;
      daily_payout: number;
      duration_days: number;
      referral_bonus: number;
      sort_order: number;
      active: boolean;
      payout_mode?: "locked" | "daily";
      maturity_return_rate?: number;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          code: z.string().min(1).max(20),
          name: z.string().min(1).max(80),
          tier: z.enum(["bronze", "silver", "gold", "diamond", "platinum"]),
          price: z.number().positive(),
          daily_payout: z.number().min(0),
          duration_days: z.number().int().positive(),
          referral_bonus: z.number().min(0),
          sort_order: z.number().int(),
          active: z.boolean(),
          payout_mode: z.enum(["locked", "daily"]).optional(),
          maturity_return_rate: z.number().positive().optional(),
        })
        .parse(d),
  )
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

export const adminDeletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { count, error: countErr } = await admin
      .from("user_packages")
      .select("id", { count: "exact", head: true })
      .eq("package_id", data.id);
    if (countErr) throw countErr;

    if ((count ?? 0) > 0) {
      const { error } = await admin.from("packages").update({ active: false }).eq("id", data.id);
      if (error) throw error;
      return { ok: true, mode: "deactivated" };
    }

    const { error } = await admin.from("packages").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true, mode: "deleted" };
  });

export const adminPromote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "client"; grant: boolean }) =>
    z
      .object({ user_id: z.string().uuid(), role: z.enum(["admin", "client"]), grant: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    if (data.grant) {
      await admin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await admin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    }
    return { ok: true };
  });

export const adminResetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: prof } = await admin
      .from("profiles")
      .select("phone,email")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!prof?.phone) throw new Error("Client has no phone number to use as the default password.");
    const password = String(prof.phone).trim();
    if (password.length < 6) throw new Error("Phone number must be at least 6 characters.");
    const { error } = await admin.auth.admin.updateUserById(data.user_id, { password });
    if (error) throw error;
    return { ok: true, password };
  });

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; amount: number; note?: string }) =>
    z
      .object({
        user_id: z.string().uuid(),
        amount: z.number().refine((v) => v !== 0),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    const isCredit = data.amount >= 0;
    const { data: wallet, error } = await admin.rpc("adjust_wallet_atomic", {
      _user_id: data.user_id,
      _balance_delta: data.amount,
      _earned_delta: 0,
      _deposited_delta: isCredit ? data.amount : 0,
      _withdrawn_delta: isCredit ? 0 : Math.abs(data.amount),
      _require_sufficient_balance: true,
    });
    if (error) throw new Error(error.message || "Adjustment would put balance below zero");
    await admin.from("transactions").insert({
      user_id: data.user_id,
      kind: isCredit ? "deposit" : "withdrawal",
      amount: data.amount,
      description: data.note || (isCredit ? "M-Pesa deposit" : "M-Pesa withdrawal"),
    });
    return { ok: true, new_balance: Number(wallet.balance) };
  });

export const adminListRedPackets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: packets } = await admin
      .from("red_packets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((packets ?? []).map((p) => p.creator_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (packets ?? []).map((p) => ({ ...p, creator: map.get(p.creator_id) ?? null }));
  });

export const adminListSpins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const { data: tickets } = await admin
      .from("spin_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    const ids = [...new Set((tickets ?? []).map((t) => t.user_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] };
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
    const [wallets, withdrawals, redPackets, deposits, txns30] = await Promise.all([
      admin.from("wallets").select("balance,total_deposited,total_withdrawn,total_earned"),
      admin.from("withdrawals").select("amount,fee,net_amount,status,created_at"),
      admin
        .from("red_packets")
        .select("total_amount,claimed_count,max_claims,ticket_value,status,created_at"),
      admin.from("deposits").select("amount,status,created_at"),
      admin
        .from("transactions")
        .select("kind,amount,created_at")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    ]);
    const sum = (rows: any[] | null, key: string) =>
      (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

    const totalDeposited = sum(wallets.data as any, "total_deposited");
    const totalWithdrawn = sum(wallets.data as any, "total_withdrawn");
    const totalEarned = sum(wallets.data as any, "total_earned");
    const clientLiability = sum(wallets.data as any, "balance");
    const clientCount = (wallets.data ?? []).length;

    const wd = withdrawals.data ?? [];
    const feesCollectedPaid = wd
      .filter((w: any) => w.status === "paid")
      .reduce((s: number, w: any) => s + Number(w.fee ?? 0), 0);
    const feesPending = wd
      .filter((w: any) => w.status !== "paid" && w.status !== "rejected")
      .reduce((s: number, w: any) => s + Number(w.fee ?? 0), 0);
    const paidOutNet = wd
      .filter((w: any) => w.status === "paid")
      .reduce(
        (s: number, w: any) => s + Number(w.net_amount ?? Number(w.amount) - Number(w.fee ?? 0)),
        0,
      );

    const packetRows = redPackets.data ?? [];
    const redPacketFunded = packetRows.reduce(
      (s: number, p: any) => s + Number(p.total_amount ?? 0),
      0,
    );
    const redPacketClaimed = packetRows.reduce(
      (s: number, p: any) =>
        s +
        Number(p.claimed_count ?? 0) *
          Math.floor(Number(p.total_amount ?? 0) / Math.max(1, Number(p.max_claims ?? 1))),
      0,
    );
    const redPacketUnclaimed = Math.max(0, redPacketFunded - redPacketClaimed);

    const successDeposits = (deposits.data ?? [])
      .filter((d: any) => d.status === "success")
      .reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);

    // 30-day averages from transactions
    const txn = txns30.data ?? [];
    const dep30 = txn
      .filter((t: any) => t.kind === "deposit")
      .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const wd30 = txn
      .filter((t: any) => t.kind === "withdrawal")
      .reduce((s: number, t: any) => s + Math.abs(Number(t.amount ?? 0)), 0);
    const avgDailyWithdrawal = wd30 / 30;
    const avgDailyDeposit = dep30 / 30;
    const netDailyOutflow = Math.max(0, avgDailyWithdrawal - avgDailyDeposit);

    // House metrics
    // House balance = deposits + unclaimed red packets + fees - withdrawals paid to users
    const houseBalance = totalDeposited + redPacketUnclaimed + feesCollectedPaid - totalWithdrawn;
    // Coverage ratio: house cash vs client liability
    const coverageRatio = clientLiability > 0 ? houseBalance / clientLiability : null;

    // Compute expected outflow from active winning copy trades.
    const nowIso = new Date().toISOString();
    const { data: openTrades } = await admin
      .from("copy_trades")
      .select("amount,profit_rate,trade_type,closes_at,last_profit_at,signal_id")
      .eq("status", "open")
      .gt("closes_at", nowIso);
    const activeCopyTrades = openTrades ?? [];
    const winningCopyTrades = activeCopyTrades.filter((trade: any) => !!trade.signal_id);
    const lossSideCopyTrades = activeCopyTrades.filter((trade: any) => !trade.signal_id);
    const openCopyCapital = activeCopyTrades.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );
    const validSignalCapital = winningCopyTrades.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );
    const lossSideCapital = lossSideCopyTrades.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );
    const remainingProfitLiability = winningCopyTrades.reduce(
      (sum: number, trade: any) => sum + getCopyTradeProfitRemaining(trade),
      0,
    );
    const recurringDailyAccrual = winningCopyTrades.reduce(
      (sum: number, trade: any) => sum + getCopyTradeDailyAccrual(trade),
      0,
    );
    const signalCycleProfitLiability = winningCopyTrades
      .filter((trade: any) => trade.trade_type === "daily")
      .reduce((sum: number, trade: any) => sum + getCopyTradeProfitRemaining(trade), 0);
    const lockedProfitLiability = remainingProfitLiability - signalCycleProfitLiability;
    const payoutLiability = validSignalCapital + remainingProfitLiability;
    const exposureCoverageRatio = payoutLiability > 0 ? houseBalance / payoutLiability : null;
    const runwayDays = recurringDailyAccrual > 0 ? houseBalance / recurringDailyAccrual : null;

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
      fees: { collected: feesCollectedPaid, pending: feesPending, rate: 0.2 },
      redPackets: {
        funded: redPacketFunded,
        claimed: redPacketClaimed,
        unclaimed: redPacketUnclaimed,
      },
      spin: { spent: 0, paidOut: 0, retained: 0 },
      house: { balance: houseBalance, runwayDays, coverageRatio },
      window30d: {
        deposits: dep30,
        withdrawals: wd30,
        avgDailyDeposit,
        avgDailyWithdrawal,
        netDailyOutflow,
      },
      expectedOutflow: {
        daily: recurringDailyAccrual,
        weekly: recurringDailyAccrual * 7,
        monthly: recurringDailyAccrual * 30,
      },
      copyTrading: {
        openTrades: activeCopyTrades.length,
        winningTrades: winningCopyTrades.length,
        lossSideTrades: lossSideCopyTrades.length,
        openCopyCapital,
        validSignalCapital,
        lossSideCapital,
        expectedProfitRemaining: remainingProfitLiability,
        signalCycleProfitLiability,
        lockedProfitLiability,
        payoutLiability,
        exposureCoverageRatio,
      },
    };
  });

export const adminGetTreasury = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const next7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const next30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    const [deposits, withdrawals, openTrades, referrals, settings, payoutTxnsToday] =
      await Promise.all([
        admin.from("deposits").select("amount,status,created_at,metadata").eq("status", "success"),
        admin.from("withdrawals").select("amount,net_amount,status,created_at"),
        admin.from("copy_trades").select("*").eq("status", "open"),
        admin.from("referral_earnings").select("amount,created_at"),
        admin.from("treasury_settings").select("*").eq("id", 1).maybeSingle(),
        admin
          .from("transactions")
          .select("kind,amount,created_at")
          .in("kind", ["payout", "copy_trade_profit"])
          .gte("created_at", startOfDay.toISOString()),
      ]);

    const successDeposits = deposits.data ?? [];
    const withdrawalRows = withdrawals.data ?? [];
    const completedWithdrawals = withdrawalRows.filter((w: any) =>
      ["paid", "success"].includes(String(w.status)),
    );
    const totalDeposits = successDeposits.reduce(
      (sum: number, d: any) => sum + Number(d.amount ?? 0),
      0,
    );
    const totalManualWithdrawals = completedWithdrawals.reduce(
      (sum: number, w: any) => sum + Number(w.amount ?? 0),
      0,
    );
    const treasuryBalance = totalDeposits - totalManualWithdrawals;

    const activeRows = (openTrades.data ?? []).filter(
      (trade: any) => new Date(trade.closes_at) > now,
    );
    const winningRows = activeRows.filter((trade: any) => !!trade.signal_id);
    const lossSideRows = activeRows.filter((trade: any) => !trade.signal_id);
    const uniqueClients = new Set(activeRows.map((trade: any) => trade.user_id)).size;
    const totalActivePrincipal = activeRows.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );
    const totalWinningPrincipal = winningRows.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );
    const totalLossSidePrincipal = lossSideRows.reduce(
      (sum: number, trade: any) => sum + Number(trade.amount ?? 0),
      0,
    );

    const matrixMap = new Map<string, any>();
    const maturityWallMap = new Map<string, number>();
    let totalDailyLiability = 0;
    let totalProfitLiability = 0;
    let totalRiskExposure = 0;

    for (const trade of activeRows) {
      const mode = String(trade.trade_type ?? "daily");
      const isWinningTrade = !!trade.signal_id;
      const code =
        mode === "daily"
          ? "30-minute copy"
          : mode === "locked7"
            ? "7-day locked copy"
            : "30-day locked copy";
      const principal = Number(trade.amount ?? 0);
      const expiresAt = new Date(trade.closes_at);
      const remainingProfit = isWinningTrade
        ? getCopyTradeProfitRemaining(trade, now.getTime())
        : 0;
      const dailyPayout = isWinningTrade ? getCopyTradeDailyAccrual(trade) : 0;
      const maturityTotal = isWinningTrade ? principal + remainingProfit : 0;
      const riskExposure = maturityTotal;
      const maturingNext7 = expiresAt <= next7 ? maturityTotal : 0;

      if (!matrixMap.has(code)) {
        matrixMap.set(code, {
          tradeType: code,
          activeSubscriptions: 0,
          validSignals: 0,
          lossSideTrades: 0,
          lossSideCapital: 0,
          dailyPayoutLiability: 0,
          remainingProfitLiability: 0,
          maturingLockedCapitalNext7: 0,
          totalRiskExposure: 0,
          mode,
        });
      }
      const row = matrixMap.get(code);
      row.activeSubscriptions += 1;
      if (isWinningTrade) row.validSignals += 1;
      else {
        row.lossSideTrades += 1;
        row.lossSideCapital += principal;
      }
      row.dailyPayoutLiability += dailyPayout;
      row.remainingProfitLiability += remainingProfit;
      row.maturingLockedCapitalNext7 += maturingNext7;
      row.totalRiskExposure += riskExposure;
      totalDailyLiability += dailyPayout;
      totalProfitLiability += remainingProfit;
      totalRiskExposure += riskExposure;

      if (expiresAt <= next30) {
        const day = expiresAt.toISOString().slice(0, 10);
        maturityWallMap.set(day, (maturityWallMap.get(day) ?? 0) + maturityTotal);
      }
    }

    const todayDeposits = successDeposits
      .filter((d: any) => new Date(d.created_at) >= startOfDay)
      .reduce((sum: number, d: any) => sum + Number(d.amount ?? 0), 0);
    const todayWithdrawals = completedWithdrawals
      .filter((w: any) => new Date(w.created_at) >= startOfDay)
      .reduce((sum: number, w: any) => sum + Number(w.amount ?? 0), 0);
    const todayPayouts = (payoutTxnsToday.data ?? []).reduce(
      (sum: number, t: any) => sum + Math.abs(Number(t.amount ?? 0)),
      0,
    );
    const todayOutflows = todayWithdrawals + todayPayouts;
    const liquidityHealthIndex = todayOutflows > 0 ? todayDeposits / todayOutflows : null;
    const estimatedRunwayDays =
      totalDailyLiability > 0 ? treasuryBalance / totalDailyLiability : null;
    const referralTotal = (referrals.data ?? []).reduce(
      (sum: number, r: any) => sum + Number(r.amount ?? 0),
      0,
    );

    return {
      summary: {
        currentTreasuryBalance: treasuryBalance,
        estimatedRunwayDays,
        totalActivePrincipal,
        totalWinningPrincipal,
        totalLossSidePrincipal,
        totalActiveClients: uniqueClients,
        openWinningTrades: winningRows.length,
        openLossSideTrades: lossSideRows.length,
        totalDailyLiability,
        totalProfitLiability,
        totalRiskExposure,
      },
      matrix: [...matrixMap.values()].sort((a, b) => a.tradeType.localeCompare(b.tradeType)),
      maturityWall: [...maturityWallMap.entries()]
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      liquidity: {
        todayDeposits,
        todayWithdrawals,
        todayPayouts,
        todayOutflows,
        liquidityHealthIndex,
      },
      referralLedger: {
        recordedLiability: referralTotal,
        pendingLiability: 0,
      },
      settings: settings.data ?? { id: 1, withdrawals_frozen: false, payouts_frozen: false },
    };
  });

export const adminUpdateTreasurySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { withdrawals_frozen?: boolean; payouts_frozen?: boolean }) =>
    z
      .object({
        withdrawals_frozen: z.boolean().optional(),
        payouts_frozen: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.userId);
    await admin.from("treasury_settings").upsert(
      {
        id: 1,
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    return { ok: true };
  });
