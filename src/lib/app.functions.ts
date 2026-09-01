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
const DIRECT_TRADE_PROFIT_REFERRAL_RATE = 0.03;
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const KYC_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

async function ensureAppStorageBuckets(supabaseAdmin: any) {
  const buckets = [
    {
      id: "kyc-documents",
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: KYC_MIME_TYPES,
    },
    {
      id: "profile-avatars",
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    },
  ];

  for (const bucket of buckets) {
    const { error } = await supabaseAdmin.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: [...bucket.allowedMimeTypes],
    });
    if (error && !/already exists|duplicate/i.test(error.message ?? "")) {
      throw error;
    }
    if (error) {
      await supabaseAdmin.storage.updateBucket(bucket.id, {
        public: bucket.public,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: [...bucket.allowedMimeTypes],
      });
    }
  }
}

function storageExt(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

async function uploadStorageBase64({
  supabaseAdmin,
  bucket,
  path,
  contentBase64,
  contentType,
}: {
  supabaseAdmin: any;
  bucket: string;
  path: string;
  contentBase64: string;
  contentType: string;
}) {
  const { Buffer } = await import("node:buffer");
  const body = Buffer.from(contentBase64, "base64");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function readXmlTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

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
    const hasWinningSignal = !!trade.signal_id;

    if (!hasWinningSignal) {
      if (!closeReached) continue;

      await supabaseAdmin
        .from("copy_trades")
        .update({
          status: "lost",
          last_profit_at: trade.closes_at,
        })
        .eq("id", trade.id);
      await supabaseAdmin.from("transactions").insert({
        user_id: trade.user_id,
        kind: "copy_trade_loss",
        amount: 0,
        description: `Closed ${getCopyTradeLabel(trade.trade_type)} as a loss`,
        ref_id: trade.id,
      });
      continue;
    }

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

    if (profitOnly > 0) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("referred_by")
        .eq("id", trade.user_id)
        .maybeSingle();
      if (prof?.referred_by) {
        const bonus = money(profitOnly * DIRECT_TRADE_PROFIT_REFERRAL_RATE);
        if (bonus > 0) {
          const { data: refWallet } = await supabaseAdmin
            .from("wallets")
            .select("balance,total_earned")
            .eq("user_id", prof.referred_by)
            .maybeSingle();
          if (refWallet) {
            await supabaseAdmin
              .from("wallets")
              .update({
                balance: money(Number(refWallet.balance ?? 0) + bonus),
                total_earned: money(Number(refWallet.total_earned ?? 0) + bonus),
              })
              .eq("user_id", prof.referred_by);
            await supabaseAdmin.from("referral_earnings").insert({
              referrer_id: prof.referred_by,
              referred_user_id: trade.user_id,
              amount: bonus,
              package_id: null,
              user_package_id: null,
              source_trade_id: trade.id,
              source: "trade_profit",
            });
            await supabaseAdmin.from("transactions").insert({
              user_id: prof.referred_by,
              kind: "direct_income",
              amount: bonus,
              description: `3% direct income from referred copy trade profit`,
              ref_id: trade.id,
            });
          }
        }
      }
    }
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
    const [wallet, trades, kyc, analysts] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("copy_trades")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("copy_trade_analysts")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    return {
      wallet: wallet.data,
      trades: trades.data ?? [],
      profitRate: COPY_TRADE_PROFIT_RATE,
      kyc: kyc.data ?? null,
      kycApproved: kyc.data?.status === "approved",
      analysts: analysts.data ?? [],
    };
  });

export const getClientTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    const [txns, deposits, withdrawals, trades, earnings] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("deposits")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("copy_trades")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_earnings")
        .select("*")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const rows = [
      ...(txns.data ?? []).map((row: any) => ({
        id: `txn:${row.id}`,
        kind: row.kind,
        title: row.description || String(row.kind).replaceAll("_", " "),
        amount: Number(row.amount ?? 0),
        status: "success",
        created_at: row.created_at,
        source: "Ledger",
      })),
      ...(deposits.data ?? []).map((row: any) => ({
        id: `deposit:${row.id}`,
        kind: "deposit",
        title: "Deposit",
        amount: Number(row.amount ?? 0),
        status: row.status,
        created_at: row.created_at,
        source: "M-Pesa",
      })),
      ...(withdrawals.data ?? []).map((row: any) => ({
        id: `withdrawal:${row.id}`,
        kind: "withdrawal",
        title: "Withdrawal",
        amount: -Number(row.amount ?? 0),
        status: row.status,
        created_at: row.created_at,
        source: "M-Pesa",
      })),
      ...(trades.data ?? []).map((row: any) => ({
        id: `trade:${row.id}`,
        kind: row.status === "lost" ? "copy_trade_loss" : "copy_trade",
        title: `${String(row.trade_type).replace("locked", "locked ")} copy trade`,
        amount: -Number(row.amount ?? 0),
        status: row.status,
        created_at: row.opened_at,
        source: "Copy trading",
      })),
      ...(earnings.data ?? []).map((row: any) => ({
        id: `earning:${row.id}`,
        kind: "direct_income",
        title: "Direct income from referred trade profit",
        amount: Number(row.amount ?? 0),
        status: "success",
        created_at: row.created_at,
        source: "Referral",
      })),
    ];

    const seen = new Set<string>();
    const items = rows
      .filter((row) => {
        const key = `${row.kind}:${row.amount}:${row.created_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { items };
  });

export const getMarketData = createServerFn({ method: "GET" }).handler(async () => {
  const symbols = [
    { symbol: "AAPL.US", label: "AAPL", name: "Apple Inc." },
    { symbol: "TSLA.US", label: "TSLA", name: "Tesla Inc." },
    { symbol: "NVDA.US", label: "NVDA", name: "NVIDIA Corp." },
    { symbol: "AMD.US", label: "AMD", name: "Advanced Micro Devices" },
    { symbol: "AMZN.US", label: "AMZN", name: "Amazon.com Inc." },
    { symbol: "NFLX.US", label: "NFLX", name: "Netflix Inc." },
    { symbol: "MSFT.US", label: "MSFT", name: "Microsoft Corp." },
    { symbol: "META.US", label: "META", name: "Meta Platforms Inc." },
    { symbol: "GOOGL.US", label: "GOOGL", name: "Alphabet Inc. Class A" },
    { symbol: "GME.US", label: "GME", name: "GameStop Corp." },
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

  const feedUrls = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,TSLA,NVDA,MSFT,META,GOOGL&region=US&lang=en-US",
    "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
    "https://www.investing.com/rss/news_25.rss",
  ];
  let news: Array<{ title: string; link: string; pubDate: string; source?: string }> = [];
  for (const url of feedUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 DerivTradingMineHub/1.0",
          accept: "application/rss+xml, application/xml, text/xml",
        },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
        .map((m) => m[0])
        .map((item) => ({
          title: readXmlTag(item, "title"),
          link: readXmlTag(item, "link") || readXmlTag(item, "guid"),
          pubDate: readXmlTag(item, "pubDate") || readXmlTag(item, "dc:date") || new Date().toISOString(),
          source: new URL(url).hostname.replace(/^www\./, ""),
        }))
        .filter((item) => item.title && item.link);
      news = [...news, ...items];
      if (news.length >= 8) break;
    } catch {
      // Try the next public feed before falling back to market-generated briefs.
    }
  }

  if (!news.length) {
    news = markets.slice(0, 6).map((item) => ({
      title: `${item.label} ${Number(item.change ?? 0) >= 0 ? "moves higher" : "pulls back"} as the latest market quote updates`,
      link: "https://finance.yahoo.com/markets/",
      pubDate: new Date().toISOString(),
      source: "Market pulse",
    }));
  }

  return { markets, news };
});

export const applyCopyTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      code?: string;
      amount: number;
      trade_type: CopyTradeType;
      source?: "signal" | "analyst";
    }) =>
    z
      .object({
        code: z.string().max(32).optional().default(""),
        amount: z.number().min(1).max(1_000_000),
        trade_type: z.enum(["daily", "locked7", "locked30"]),
        source: z.enum(["signal", "analyst"]).optional().default("signal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await settleCopyTrades(supabaseAdmin, userId);
    const { data: kyc } = await supabaseAdmin
      .from("kyc_verifications")
      .select("status")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (kyc?.status !== "approved") {
      throw new Error("KYC verification must be approved before you can trade.");
    }
    const source = data.source ?? "signal";
    const code = (data.code ?? "").trim().toUpperCase();
    if (source === "signal" && code.length < 3) {
      throw new Error("Enter a signal code before applying.");
    }
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < data.amount) throw new Error("Insufficient balance");

    const { data: signal } =
      source === "signal"
        ? await supabaseAdmin
            .from("copy_trade_signals")
            .select("*")
            .eq("code", code)
            .eq("trade_type", data.trade_type)
            .eq("active", true)
            .lte("valid_from", new Date().toISOString())
            .gt("expires_at", new Date().toISOString())
            .maybeSingle()
        : { data: null };

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
        status: "open",
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
        : source === "signal"
          ? `Opened ${getCopyTradeLabel(data.trade_type)} with invalid signal code`
          : `Opened analyst copy trade without a signal code`,
      ref_id: trade.id,
    });

    if (!signal) {
      return {
        ok: true,
        status: "open",
        closes_at: closesAt,
        expected_profit: 0,
        will_win: false,
        message:
          source === "signal"
            ? "Trade opened. This signal code will settle as a loss after the cycle."
            : "Analyst copy opened. No-code copies settle as a loss after the cycle.",
      };
    }

    return {
      ok: true,
      status: "open",
      closes_at: closesAt,
      expected_profit: money(Number(data.amount) * COPY_TRADE_PROFIT_RATE),
      will_win: true,
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
        .select("*")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    // 2nd-level indirect
    const directIds = (direct.data ?? []).map((d) => d.id);
    let indirect: Array<{ id: string; full_name: string | null }> = [];
    let tradeRows: any[] = [];
    if (directIds.length) {
      const [{ data }, { data: trades }] = await Promise.all([
        supabase
        .from("profiles")
        .select("id, full_name")
          .in("referred_by", directIds),
        supabase.from("copy_trades").select("id,user_id,amount,total_profit_paid,status").in("user_id", directIds),
      ]);
      indirect = data ?? [];
      tradeRows = trades ?? [];
    }
    const totalEarned = (earnings.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
    const earnedByUser = (earnings.data ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.referred_user_id] = (acc[row.referred_user_id] ?? 0) + Number(row.amount ?? 0);
      return acc;
    }, {});
    const tradesByUser = tradeRows.reduce<Record<string, { count: number; amount: number; profit: number }>>(
      (acc, row: any) => {
        const item = acc[row.user_id] ?? { count: 0, amount: 0, profit: 0 };
        item.count += 1;
        item.amount += Number(row.amount ?? 0);
        item.profit += Number(row.total_profit_paid ?? 0);
        acc[row.user_id] = item;
        return acc;
      },
      {},
    );
    return {
      referralCode: profile.data?.referral_code ?? "",
      directReferrals: (direct.data ?? []).map((ref: any) => ({
        ...ref,
        trade_count: tradesByUser[ref.id]?.count ?? 0,
        traded_amount: tradesByUser[ref.id]?.amount ?? 0,
        trade_profit: tradesByUser[ref.id]?.profit ?? 0,
        earned_from_trades: earnedByUser[ref.id] ?? 0,
      })),
      indirectCount: indirect.length,
      earnings: earnings.data ?? [],
      totalEarned,
    };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, wallet, roles, kyc] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      profile: profile.data,
      wallet: wallet.data,
      kyc: kyc.data ?? null,
      kycApproved: kyc.data?.status === "approved",
      isAdmin: (roles.data ?? []).some((r) => r.role === "admin"),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name?: string; phone?: string; avatar_url?: string }) =>
    z
      .object({
        full_name: z.string().max(80).optional(),
        phone: z.string().max(15).optional(),
        avatar_url: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const uploadProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { file_name: string; mime_type: string; content_base64: string }) =>
    z
      .object({
        file_name: z.string().min(1).max(160),
        mime_type: z.enum(IMAGE_MIME_TYPES),
        content_base64: z.string().min(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAppStorageBuckets(supabaseAdmin);
    const ext = storageExt(data.file_name, data.mime_type);
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    await uploadStorageBase64({
      supabaseAdmin,
      bucket: "profile-avatars",
      path,
      contentBase64: data.content_base64,
      contentType: data.mime_type,
    });
    const { data: publicUrl } = supabaseAdmin.storage.from("profile-avatars").getPublicUrl(path);
    await supabaseAdmin.from("profiles").update({ avatar_url: publicUrl.publicUrl }).eq("id", userId);
    return { ok: true, avatar_url: publicUrl.publicUrl };
  });

export const uploadKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      file_name: string;
      mime_type: string;
      content_base64: string;
      document_type: "id-front" | "id-back" | "selfie-holding-id";
    }) =>
      z
        .object({
          file_name: z.string().min(1).max(160),
          mime_type: z.enum(KYC_MIME_TYPES),
          content_base64: z.string().min(20),
          document_type: z.enum(["id-front", "id-back", "selfie-holding-id"]),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAppStorageBuckets(supabaseAdmin);
    const ext = storageExt(data.file_name, data.mime_type);
    const path = `${userId}/${data.document_type}-${Date.now()}.${ext}`;
    await uploadStorageBase64({
      supabaseAdmin,
      bucket: "kyc-documents",
      path,
      contentBase64: data.content_base64,
      contentType: data.mime_type,
    });
    return { path };
  });

export const getTransactions = getClientTransactions;

export const submitKycVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id_front_path: string; id_back_path: string; selfie_path: string }) =>
    z
      .object({
        id_front_path: z.string().min(5).max(500),
        id_back_path: z.string().min(5).max(500),
        selfie_path: z.string().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownsPaths = [data.id_front_path, data.id_back_path, data.selfie_path].every((path) =>
      path.startsWith(`${context.userId}/`),
    );
    if (!ownsPaths) throw new Error("Invalid KYC upload path.");
    const { data: existing } = await supabaseAdmin
      .from("kyc_verifications")
      .select("status")
      .eq("user_id", context.userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.status === "pending") throw new Error("Your KYC is already under review.");
    const { error } = await supabaseAdmin.from("kyc_verifications").insert({
      user_id: context.userId,
      status: "pending",
      id_front_path: data.id_front_path,
      id_back_path: data.id_back_path,
      selfie_path: data.selfie_path,
      rejection_reason: null,
    });
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
