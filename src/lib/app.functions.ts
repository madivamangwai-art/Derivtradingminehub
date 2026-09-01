import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildWalletActivityItems } from "@/lib/payment-state";
import { initiateWithdrawalPayout } from "@/lib/mpesa.functions";
import { reconcilePendingWalletActivity } from "@/lib/payment-reconcile";

// ============ Client-facing server functions ============

const PURCHASE_LIMIT_BY_TIER: Record<string, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  diamond: 5,
  platinum: 10,
};

export type PackagePayoutMode = "locked" | "daily";
export type CopyTradeType = "daily" | "locked7" | "locked30";

function money(amount: number) {
  return Math.round(Number(amount) * 100) / 100;
}

const COPY_TRADE_PROFIT_RATE = 0.016;
const DAILY_COPY_TRADE_MINUTES = 30;

function getCopyTradeDurationMs(type: CopyTradeType) {
  if (type === "daily") return DAILY_COPY_TRADE_MINUTES * 60 * 1000;
  if (type === "locked7") return 7 * 24 * 3600 * 1000;
  return 30 * 24 * 3600 * 1000;
}

function getCopyTradeLabel(type: CopyTradeType) {
  if (type === "daily") return "30-minute copy trade";
  if (type === "locked7") return "7-day locked copy trade";
  return "30-day locked copy trade";
}

async function settleCopyTrades(supabaseAdmin: any, userId?: string) {
  const now = Date.now();
  let query = supabaseAdmin
    .from("copy_trades")
    .select("*")
    .eq("status", "open")
    .lte("last_profit_at", new Date(now).toISOString());
  if (userId) query = query.eq("user_id", userId);

  const { data: trades } = await query.limit(500);
  for (const trade of trades ?? []) {
    const openedAt = new Date(trade.opened_at).getTime();
    const closesAt = new Date(trade.closes_at).getTime();
    const lastProfitAt = new Date(trade.last_profit_at ?? trade.opened_at).getTime();
    const amount = Number(trade.amount ?? 0);
    const rate = Number(trade.profit_rate ?? COPY_TRADE_PROFIT_RATE);
    const closeReached = closesAt <= now;
    let credit = 0;
    let status = "open";
    let lastProfitIso = trade.last_profit_at;

    if (trade.trade_type === "daily") {
      if (!closeReached) continue;
      credit = money(amount + amount * rate);
      status = "won";
      lastProfitIso = trade.closes_at;
    } else {
      const effectiveEnd = Math.min(now, closesAt);
      const elapsedDays = Math.floor((effectiveEnd - lastProfitAt) / 86400000);
      const profit = money(amount * rate * Math.max(0, elapsedDays));
      credit = closeReached ? money(profit + amount) : profit;
      status = closeReached ? "won" : "open";
      lastProfitIso =
        elapsedDays > 0
          ? new Date(lastProfitAt + elapsedDays * 86400000).toISOString()
          : trade.last_profit_at;
    }

    if (credit <= 0 && status === "open") continue;

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance,total_earned")
      .eq("user_id", trade.user_id)
      .maybeSingle();
    if (!wallet) continue;

    const profitOnly = trade.trade_type === "daily" ? money(amount * rate) : Math.max(0, credit - (closeReached ? amount : 0));
    await supabaseAdmin
      .from("wallets")
      .update({
        balance: money(Number(wallet.balance) + credit),
        total_earned: money(Number(wallet.total_earned ?? 0) + profitOnly),
      })
      .eq("user_id", trade.user_id);
    await supabaseAdmin
      .from("copy_trades")
      .update({
        status,
        last_profit_at: lastProfitIso,
        total_profit_paid: money(Number(trade.total_profit_paid ?? 0) + profitOnly),
      })
      .eq("id", trade.id);
    await supabaseAdmin.from("transactions").insert({
      user_id: trade.user_id,
      kind: "copy_trade_profit",
      amount: credit,
      description:
        status === "won"
          ? `Closed ${getCopyTradeLabel(trade.trade_type)}`
          : `Daily profit from ${getCopyTradeLabel(trade.trade_type)}`,
      ref_id: trade.id,
    });
  }
}

export function getPackagePayoutMode(pkg: any): PackagePayoutMode {
  const mode = String(pkg?.payout_mode ?? "").toLowerCase();
  if (mode === "locked" || mode === "daily") return mode;
  const code = String(pkg?.code ?? "").toUpperCase();
  if (code.startsWith("L") || Number(pkg?.daily_payout ?? 0) <= 0) return "locked";
  return "daily";
}

export function getPackageMaturityReturnRate(pkg: any) {
  const configured = Number(pkg?.maturity_return_rate ?? 0);
  if (configured > 0) return configured;
  return getPackagePayoutMode(pkg) === "locked" ? 1.35 : 1;
}

export function getPackagePurchaseLimit(pkg: any) {
  const tier = String(pkg?.tier ?? "").toLowerCase();
  if (PURCHASE_LIMIT_BY_TIER[tier]) return PURCHASE_LIMIT_BY_TIER[tier];

  const price = Number(pkg?.price ?? 0);
  if (price >= 50000) return 10;
  if (price >= 20000) return 5;
  if (price >= 10000) return 3;
  if (price >= 5000) return 2;
  return 1;
}

// Claim schedule: package payouts unlock at 01:00 Africa/Nairobi (EAT, UTC+3) each day.
// A boundary at 01:00 EAT of EAT-day D is UTC timestamp D*86400e3 - 3600e3.
const EAT_OFFSET_MS = 3 * 3600 * 1000;
export function computePending(
  refIso: string,
  expiresIso: string,
  dailyPayout: number,
  nowMs = Date.now(),
) {
  const ref = new Date(refIso).getTime();
  const expires = new Date(expiresIso).getTime();
  const cap = Math.min(nowMs, expires);
  const eatDay = (t: number) => Math.floor((t + EAT_OFFSET_MS) / 86400000);
  const boundaryUTC = (D: number) => D * 86400000 - 3600000;
  let firstD = eatDay(ref);
  if (boundaryUTC(firstD) <= ref) firstD += 1;
  let lastD = eatDay(cap);
  if (boundaryUTC(lastD) > cap) lastD -= 1;
  if (lastD < firstD || cap <= ref)
    return {
      days: 0,
      amount: 0,
      lastBoundaryIso: refIso,
      nextBoundaryIso: new Date(boundaryUTC(firstD)).toISOString(),
    };
  const days = lastD - firstD + 1;
  return {
    days,
    amount: days * Number(dailyPayout),
    lastBoundaryIso: new Date(boundaryUTC(lastD)).toISOString(),
    nextBoundaryIso: new Date(boundaryUTC(lastD + 1)).toISOString(),
  };
}

export function computePackageClaim(up: any, nowMs = Date.now()) {
  const pkg = up.packages ?? {};
  const mode = getPackagePayoutMode(pkg);
  const expiresMs = new Date(up.expires_at).getTime();
  const paid = Number(up.total_paid_out ?? 0);
  const price = Number(pkg.price ?? 0);
  const dailyPayout = Number(pkg.daily_payout ?? 0);
  const duration = Number(pkg.duration_days ?? 0);
  const matured = expiresMs <= nowMs;

  if (mode === "locked") {
    const maturityAmount = money(price * getPackageMaturityReturnRate(pkg));
    const remaining = money(Math.max(0, maturityAmount - paid));
    return {
      mode,
      days: 0,
      amount: matured ? remaining : 0,
      dailyAmount: 0,
      principalAmount: 0,
      maturityAmount: matured ? remaining : maturityAmount,
      lastBoundaryIso: up.last_payout_at ?? up.purchased_at,
      nextBoundaryIso: up.expires_at,
      matured,
      completed: matured && remaining > 0,
      expectedTotal: maturityAmount,
    };
  }

  const pending = computePending(
    up.last_payout_at ?? up.purchased_at,
    up.expires_at,
    dailyPayout,
    nowMs,
  );
  const maxDailyTotal = money(dailyPayout * duration);
  const dailyAlreadyPaid = Math.min(paid, maxDailyTotal);
  const dailyAmount = money(
    Math.min(pending.amount, Math.max(0, maxDailyTotal - dailyAlreadyPaid)),
  );
  const principalAlreadyPaid = paid > maxDailyTotal;
  const principalAmount = matured && !principalAlreadyPaid ? price : 0;
  const expectedTotal = money(maxDailyTotal + price);

  return {
    mode,
    days: pending.days,
    amount: money(dailyAmount + principalAmount),
    dailyAmount,
    principalAmount,
    maturityAmount: matured ? principalAmount : price,
    lastBoundaryIso: pending.lastBoundaryIso,
    nextBoundaryIso: pending.nextBoundaryIso,
    matured,
    completed: matured && money(paid + dailyAmount + principalAmount) >= expectedTotal,
    expectedTotal,
  };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    const [wallet, profile, activePkgs, activeTrades, recentTxns, refCount] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("user_packages")
        .select("*, packages(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("purchased_at", { ascending: false }),
      supabase
        .from("copy_trades")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", userId),
    ]);
    const withPending = (activePkgs.data ?? []).map((up: any) => ({
      ...up,
      pending: computePackageClaim(up),
    }));
    return {
      wallet: wallet.data ?? {
        balance: 0,
        total_earned: 0,
        total_deposited: 0,
        total_withdrawn: 0,
      },
      profile: profile.data,
      activePackages: withPending,
      activeTrades: activeTrades.data ?? [],
      recentTransactions: recentTxns.data ?? [],
      referralCount: refCount.count ?? 0,
    };
  });

export const getCopyTradingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    const [wallet, trades] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("copy_trades")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(50),
    ]);
    return { wallet: wallet.data, trades: trades.data ?? [], profitRate: COPY_TRADE_PROFIT_RATE };
  });

export const getMarketData = createServerFn({ method: "GET" }).handler(async () => {
  const symbols = [
    { symbol: "AAPL.US", label: "AAPL", name: "Apple Inc." },
    { symbol: "TSLA.US", label: "TSLA", name: "Tesla Inc." },
    { symbol: "NVDA.US", label: "NVDA", name: "NVIDIA Corp." },
    { symbol: "^NDQ", label: "Nasdaq", name: "Nasdaq" },
    { symbol: "^DJI", label: "Dow Jones", name: "Dow Jones" },
    { symbol: "^SPX", label: "S&P 500", name: "S&P 500" },
  ];

  const quoteUrl = `https://stooq.com/q/l/?s=${symbols.map((s) => s.symbol).join("+")}&f=sd2t2ohlcv&h&e=csv`;
  let markets = symbols.map((s) => ({ ...s, price: 0, change: 0, open: 0, high: 0, low: 0 }));
  try {
    const res = await fetch(quoteUrl);
    const csv = await res.text();
    const rows = csv.trim().split(/\r?\n/).slice(1);
    markets = rows.map((row, index) => {
      const [symbol, date, time, open, high, low, close] = row.split(",");
      const meta = symbols.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase()) ?? symbols[index];
      const openValue = Number(open);
      const price = Number(close);
      return {
        ...meta,
        time: `${date} ${time}`,
        price,
        open: openValue,
        high: Number(high),
        low: Number(low),
        change: openValue > 0 ? ((price - openValue) / openValue) * 100 : 0,
      };
    });
  } catch {
    // The UI falls back to zeroed quotes if the free source is unavailable.
  }

  let news: Array<{ title: string; link: string; pubDate: string }> = [];
  try {
    const res = await fetch("https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,TSLA,NVDA&region=US&lang=en-US");
    const xml = await res.text();
    news = [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g)]
      .slice(0, 8)
      .map((m) => ({ title: m[1], link: m[2], pubDate: m[3] }));
  } catch {
    news = [];
  }

  return { markets, news };
});

export const applyCopyTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; amount: number; trade_type: CopyTradeType }) =>
    z
      .object({
        code: z.string().min(3).max(32),
        amount: z.number().min(1).max(1_000_000),
        trade_type: z.enum(["daily", "locked7", "locked30"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    const code = data.code.trim().toUpperCase();
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < data.amount) throw new Error("Insufficient balance");

    const { data: signal } = await supabaseAdmin
      .from("copy_trade_signals")
      .select("*")
      .eq("code", code)
      .eq("trade_type", data.trade_type)
      .eq("active", true)
      .lte("valid_from", new Date().toISOString())
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    await supabaseAdmin
      .from("wallets")
      .update({ balance: money(Number(wallet.balance) - data.amount) })
      .eq("user_id", userId);

    const closesAt = new Date(Date.now() + getCopyTradeDurationMs(data.trade_type)).toISOString();
    const { data: trade, error } = await supabaseAdmin
      .from("copy_trades")
      .insert({
        user_id: userId,
        signal_id: signal?.id ?? null,
        code_entered: code,
        trade_type: data.trade_type,
        amount: data.amount,
        profit_rate: COPY_TRADE_PROFIT_RATE,
        closes_at: closesAt,
        status: signal ? "open" : "lost",
      })
      .select()
      .single();
    if (error) throw error;

    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      kind: signal ? "copy_trade_open" : "copy_trade_loss",
      amount: -Number(data.amount),
      description: signal
        ? `Opened ${getCopyTradeLabel(data.trade_type)}`
        : `Lost copy trade - invalid ${getCopyTradeLabel(data.trade_type)} code`,
      ref_id: trade.id,
    });

    if (!signal) {
      return { ok: false, status: "lost", message: "Signal code did not match. Trade lost." };
    }

    return {
      ok: true,
      status: "open",
      closes_at: closesAt,
      expected_profit: money(Number(data.amount) * COPY_TRADE_PROFIT_RATE),
    };
  });

export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data }, { data: purchases }] = await Promise.all([
      supabase.from("packages").select("*").eq("active", true).order("sort_order"),
      supabase.from("user_packages").select("package_id").eq("user_id", userId),
    ]);

    const purchaseCounts = (purchases ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.package_id] = (acc[row.package_id] ?? 0) + 1;
      return acc;
    }, {});

    return (data ?? []).map((pkg: any) => {
      const limit = getPackagePurchaseLimit(pkg);
      const purchasedCount = purchaseCounts[pkg.id] ?? 0;
      return {
        ...pkg,
        purchase_limit: limit,
        purchased_count: purchasedCount,
        purchases_remaining: Math.max(0, limit - purchasedCount),
      };
    });
  });

export const getWalletData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    await expireStalePendingWithdrawals(supabaseAdmin);
    try {
      await reconcilePendingWalletActivity(supabaseAdmin, userId);
    } catch (e) {
      console.error("reconcilePendingWalletActivity err", e);
    }
    const [wallet, deposits, withdrawals, txns] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("deposits")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const activity = buildWalletActivityItems(
      deposits.data ?? [],
      withdrawals.data ?? [],
      txns.data ?? [],
    );
    return {
      wallet: wallet.data,
      deposits: deposits.data ?? [],
      withdrawals: withdrawals.data ?? [],
      transactions: txns.data ?? [],
      canWithdraw: true,
      activity,
    };
  });

export const WITHDRAWAL_FEE_RATE = 0.2;
const STALE_WITHDRAWAL_HOURS = 24;

async function expireStalePendingWithdrawals(supabaseAdmin: any) {
  const cutoff = new Date(Date.now() - STALE_WITHDRAWAL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("withdrawals")
    .select("id,user_id")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (!stale?.length) return 0;

  await Promise.all(
    stale.map((wd: any) =>
      supabaseAdmin
        .from("withdrawals")
        .update({
          status: "failed",
          admin_note: `Auto-expired after ${STALE_WITHDRAWAL_HOURS} hours because no payout was confirmed.`,
        })
        .eq("id", wd.id),
    ),
  );

  return stale.length;
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) =>
    z.object({ amount: z.number().min(1).max(1_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await expireStalePendingWithdrawals(supabaseAdmin);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.phone) throw new Error("Please set your phone number in the My tab first.");
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < data.amount) throw new Error("Insufficient balance");
    const { data: settings } = await supabaseAdmin
      .from("treasury_settings")
      .select("withdrawals_frozen")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.withdrawals_frozen) {
      throw new Error(
        "Withdrawals are temporarily paused by treasury controls. Please try again later.",
      );
    }
    const fee = Math.round(Number(data.amount) * WITHDRAWAL_FEE_RATE * 100) / 100;
    const net = Math.round((Number(data.amount) - fee) * 100) / 100;

    const { data: wd, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: data.amount,
        fee,
        fee_rate: WITHDRAWAL_FEE_RATE,
        net_amount: net,
        mpesa_phone: prof.phone,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    try {
      // Send net amount to provider so the user receives amount - fee
      const payout = await initiateWithdrawalPayout({
        phone: prof.phone,
        amount: Number(net),
        withdrawalId: wd.id,
      });
      const conversationId = payout?.ConversationID ?? null;
      const originatorConversationId = payout?.OriginatorConversationID ?? null;
      const responseCode = String(payout?.ResponseCode ?? payout?.responseCode ?? "");
      const responseDescription = String(
        payout?.ResponseDescription ?? payout?.responseDescription ?? "",
      );
      const payoutAccepted =
        responseCode === "0" ||
        responseCode === "000000" ||
        /success|accepted/i.test(responseDescription);

      await supabaseAdmin
        .from("withdrawals")
        .update({
          status: payoutAccepted ? "success" : "processing",
          admin_note:
            responseDescription ||
            (payoutAccepted ? "Payout accepted by M-Pesa." : "Payout request sent to M-Pesa."),
          conversation_id: conversationId,
          originator_conversation_id: originatorConversationId,
          provider_reference: conversationId ?? payout?.OriginatorConversationID ?? null,
        })
        .eq("id", wd.id);

      if (payoutAccepted) {
        const { data: w } = await supabaseAdmin
          .from("wallets")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (w) {
          await supabaseAdmin
            .from("wallets")
            .update({
              // deduct gross amount from wallet
              balance: Number(w.balance) - Number(data.amount),
              total_withdrawn: Number(w.total_withdrawn ?? 0) + Number(data.amount),
            })
            .eq("user_id", userId);
        }
        await supabaseAdmin.from("transactions").insert({
          user_id: userId,
          kind: "withdrawal",
          amount: -Number(data.amount),
          description: `Withdrawal completed`,
          ref_id: wd.id,
        });
        return { ok: true, fee, net, status: "success", withdrawal_id: wd.id };
      }

      return { ok: true, fee, net, status: "processing", withdrawal_id: wd.id };
    } catch (payoutError) {
      const message = payoutError instanceof Error ? payoutError.message : String(payoutError);
      await supabaseAdmin
        .from("withdrawals")
        .update({ status: "failed", admin_note: message })
        .eq("id", wd.id);
      throw new Error(message);
    }
  });

export const purchasePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { package_id: string }) =>
    z.object({ package_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("*")
      .eq("id", data.package_id)
      .eq("active", true)
      .maybeSingle();
    if (!pkg) throw new Error("Package unavailable");

    const purchaseLimit = getPackagePurchaseLimit(pkg);
    const { count, error: countErr } = await supabaseAdmin
      .from("user_packages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("package_id", pkg.id);
    if (countErr) throw countErr;
    if ((count ?? 0) >= purchaseLimit) {
      throw new Error(
        `You can buy ${pkg.name} only ${purchaseLimit} time${purchaseLimit === 1 ? "" : "s"}.`,
      );
    }

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < Number(pkg.price))
      throw new Error("Insufficient wallet balance. Deposit first.");

    const newBalance = Number(wallet.balance) - Number(pkg.price);
    const expiresAt = new Date(Date.now() + pkg.duration_days * 24 * 3600 * 1000).toISOString();

    const { data: up, error: upErr } = await supabaseAdmin
      .from("user_packages")
      .insert({
        user_id: userId,
        package_id: pkg.id,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (upErr) throw upErr;

    await supabaseAdmin.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      kind: "purchase",
      amount: -Number(pkg.price),
      description: `Purchased ${pkg.name}`,
      ref_id: up.id,
    });

    // Referral bonus (once per referrer + referred user + package tier)
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.referred_by && Number(pkg.referral_bonus) > 0) {
      const { data: existing } = await supabaseAdmin
        .from("referral_earnings")
        .select("id")
        .eq("referrer_id", prof.referred_by)
        .eq("referred_user_id", userId)
        .eq("package_id", pkg.id)
        .maybeSingle();
      if (!existing) {
        const { error: refErr } = await supabaseAdmin.from("referral_earnings").insert({
          referrer_id: prof.referred_by,
          referred_user_id: userId,
          package_id: pkg.id,
          user_package_id: up.id,
          amount: Number(pkg.referral_bonus),
        });
        if (!refErr) {
          const { data: refWallet } = await supabaseAdmin
            .from("wallets")
            .select("balance,total_earned")
            .eq("user_id", prof.referred_by)
            .maybeSingle();
          if (refWallet) {
            await supabaseAdmin
              .from("wallets")
              .update({
                balance: Number(refWallet.balance) + Number(pkg.referral_bonus),
                total_earned: Number(refWallet.total_earned) + Number(pkg.referral_bonus),
              })
              .eq("user_id", prof.referred_by);
            await supabaseAdmin.from("transactions").insert({
              user_id: prof.referred_by,
              kind: "referral",
              amount: Number(pkg.referral_bonus),
              description: `Referral bonus (${pkg.name})`,
              ref_id: up.id,
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
      supabase
        .from("profiles")
        .select("id, full_name, email, created_at")
        .eq("referred_by", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("referral_earnings")
        .select("*, packages(name,tier)")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    // 2nd-level indirect
    const directIds = (direct.data ?? []).map((d) => d.id);
    let indirect: Array<{ id: string; full_name: string | null }> = [];
    if (directIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("referred_by", directIds);
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
    z
      .object({ full_name: z.string().max(80).optional(), phone: z.string().max(15).optional() })
      .parse(d),
  )
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
  .inputValidator((d: { message: string }) =>
    z.object({ message: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("support_messages")
      .insert({ user_id: userId, sender: "user", message: data.message });
    if (error) throw error;
    return { ok: true };
  });

export const claimPackagePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_package_id: string }) =>
    z.object({ user_package_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: up } = await supabaseAdmin
      .from("user_packages")
      .select("*, packages(*)")
      .eq("id", data.user_package_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!up) throw new Error("Package not found");
    if (!["active", "completed"].includes(up.status))
      throw new Error("Package is no longer payable");
    const pkg: any = up.packages;
    const pend = computePackageClaim(up);
    if (pend.amount <= 0) throw new Error("Nothing to claim yet. Come back after 01:00.");

    const { data: w } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!w) throw new Error("Wallet missing");
    await supabaseAdmin
      .from("wallets")
      .update({
        balance: Number(w.balance) + pend.amount,
        total_earned: Number(w.total_earned) + pend.amount,
      })
      .eq("user_id", userId);
    await supabaseAdmin
      .from("user_packages")
      .update({
        last_payout_at: pend.lastBoundaryIso,
        total_paid_out: Number(up.total_paid_out) + pend.amount,
        status: pend.completed ? "completed" : "active",
      })
      .eq("id", up.id);
    const pieces = [
      pend.dailyAmount > 0 ? `${pend.days} day${pend.days > 1 ? "s" : ""}` : null,
      pend.principalAmount > 0 ? "principal" : null,
      pend.mode === "locked" ? "locked maturity" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      kind: "payout",
      amount: pend.amount,
      description: `Claimed ${pieces || "package payout"} - ${pkg.name}`,
      ref_id: up.id,
    });
    return { ok: true, amount: pend.amount, days: pend.days };
  });
