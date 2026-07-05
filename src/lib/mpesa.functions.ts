import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readEnvValue } from "@/lib/env";
import { isMpesaPendingStatus, isMpesaTerminalFailure } from "@/lib/mpesa-status";

function mpesaBaseUrls() {
  const envValue = (readEnvValue('MPESA_ENV', 'DARAJA_ENV') ?? "sandbox").toLowerCase();
  const preferred = envValue === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const fallback = preferred === "https://api.safaricom.co.ke" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke";
  return [preferred, fallback];
}

export async function getMpesaToken() {
  const key = readEnvValue('MPESA_CONSUMER_KEY', 'DARAJA_CONSUMER_KEY');
  const secret = readEnvValue('MPESA_CONSUMER_SECRET', 'DARAJA_CONSUMER_SECRET');
  if (!key || !secret) throw new Error("M-Pesa credentials not configured.");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const attempts = mpesaBaseUrls();

  let lastError: Error | undefined;
  for (const baseUrl of attempts) {
    try {
      const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (res.ok) {
        const j = await res.json() as { access_token: string };
        return { token: j.access_token, baseUrl };
      }
      const body = await res.text().catch(() => "");
      lastError = new Error(`M-Pesa auth failed (${res.status}) for ${baseUrl}. ${body.includes("Invalid") ? "Check MPESA_ENV matches your credentials (sandbox vs production)." : body}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("M-Pesa auth failed.");
}

function normalizePhone(phone: string): string {
  const p = phone.replace(/\D/g, "");
  if (p.startsWith("254")) return p;
  if (p.startsWith("0")) return "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) return "254" + p;
  return p;
}

function tsAndPassword(shortcode: string, passkey: string) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  return { timestamp, password };
}

function resolvePublicBaseUrl(path = "/api/public/mpesa/payout/callback") {
  const candidates = [
    readEnvValue('APP_URL', 'SITE_URL', 'PUBLIC_URL', 'NEXT_PUBLIC_SITE_URL'),
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
  ].filter((value): value is string => Boolean(value && value.trim()));

  const candidate = candidates[0];
  if (!candidate) return `https://example.com${path}`;
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  return withProtocol.replace(/\/$/, '') + path;
}

export async function queryWithdrawalPayoutStatus({
  phone,
  shortcode,
  initiatorName,
  securityCredential,
  conversationId,
  originatorConversationId,
}: {
  phone: string;
  shortcode: string;
  initiatorName: string;
  securityCredential: string;
  conversationId?: string;
  originatorConversationId?: string;
}) {
  const { token, baseUrl } = await getMpesaToken();
  const body = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    PartyA: shortcode,
    IdentifierType: 4,
    Remarks: 'MineHub payout status check',
    QueueTimeOutURL: resolvePublicBaseUrl(),
    ResultURL: resolvePublicBaseUrl(),
    ConversationID: conversationId,
    OriginatorConversationID: originatorConversationId,
  };

  const res = await fetch(`${baseUrl}/mpesa/b2c/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as any;
  const responseCode = String(json?.ResponseCode ?? json?.errorCode ?? '');
  const responseDescription = String(json?.ResponseDescription ?? json?.errorMessage ?? '');
  if (responseCode === '0' || responseCode === '000000') return { status: 'success' as const, responseDescription };
  if (responseCode && responseCode !== '0') return { status: 'failed' as const, responseDescription };
  return { status: 'pending' as const, responseDescription };
}

export async function initiateWithdrawalPayout({
  phone,
  amount,
  withdrawalId,
}: {
  phone: string;
  amount: number;
  withdrawalId: string;
}) {
  const shortcode = readEnvValue('MPESA_B2C_SHORTCODE', 'DARAJA_B2C_SHORTCODE', 'MPESA_SHORTCODE');
  const initiatorName = readEnvValue(
    'MPESA_B2C_INITIATOR_NAME',
    'DARAJA_B2C_INITIATOR_NAME',
    'MPESA_B2C_INITIATOR',
    'DARAJA_B2C_INITIATOR',
    'MPESA_INITIATOR_NAME',
  );
  const securityCredential = readEnvValue(
    'MPESA_B2C_SECURITY_CREDENTIAL',
    'DARAJA_B2C_SECURITY_CREDENTIAL',
    'MPESA_B2C_SECURITY',
    'DARAJA_B2C_SECURITY',
    'MPESA_SECURITY_CREDENTIAL',
  );
  const commandId = readEnvValue('MPESA_B2C_COMMAND_ID', 'DARAJA_B2C_COMMAND_ID', 'MPESA_COMMAND_ID') ?? 'BusinessPayment';
  if (!shortcode || !initiatorName || !securityCredential) {
    throw new Error('Payout provider is not configured. Set the B2C shortcode, initiator name, and security credential in Vercel using either the MPESA_B2C_* or DARAJA_B2C_* names.');
  }

  const { token, baseUrl } = await getMpesaToken();
  const body = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: commandId,
    Amount: Math.round(amount),
    PartyA: shortcode,
    PartyB: normalizePhone(phone),
    Remarks: `MineHub withdrawal ${withdrawalId.slice(0, 8)}`,
    QueueTimeOutURL: readEnvValue('MPESA_B2C_QUEUE_URL', 'DARAJA_B2C_TIMEOUT_URL') ?? resolvePublicBaseUrl(),
    ResultURL: readEnvValue('MPESA_B2C_RESULT_URL', 'DARAJA_B2C_RESULT_URL') ?? resolvePublicBaseUrl(),
    Occasion: `withdrawal-${withdrawalId.slice(0, 8)}`,
  };

  const res = await fetch(`${baseUrl}/mpesa/b2c/v1/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    throw new Error(json?.errorMessage ?? json?.requestId ?? 'Payout failed');
  }
  const responseCode = String(json?.ResponseCode ?? '');
  const responseDescription = String(json?.ResponseDescription ?? json?.errorMessage ?? '');
  if (responseCode && responseCode !== '0') {
    throw new Error(
      responseDescription || 'Payout failed'
    );
  }
  return json;
}

export const initiateStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) =>
    z.object({ amount: z.number().int().min(10).max(1_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const shortcode = readEnvValue('MPESA_SHORTCODE', 'DARAJA_STK_SHORTCODE');
    const passkey = readEnvValue('MPESA_PASSKEY', 'DARAJA_STK_PASSKEY');
    if (!shortcode || !passkey) throw new Error("M-Pesa shortcode/passkey not configured");

    const { data: prof } = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle();
    if (!prof?.phone) throw new Error("Please set your phone number in the My tab first.");

    const { token, baseUrl } = await getMpesaToken();
    const { timestamp, password } = tsAndPassword(shortcode, passkey);
    const phone = normalizePhone(prof.phone);

    // Derive callback URL from the incoming request so remixes work
    let callbackUrl = readEnvValue('MPESA_CALLBACK_URL', 'DARAJA_CALLBACK_URL');
    if (!callbackUrl) {
      try {
        const req = getRequest();
        const url = new URL(req!.url);
        callbackUrl = `${url.origin}/api/public/mpesa/callback`;
      } catch {
        callbackUrl = "https://example.com/api/public/mpesa/callback";
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dep, error: depErr } = await supabaseAdmin.from("deposits").insert({
      user_id: userId, amount: data.amount, mpesa_phone: phone, status: "pending",
    }).select().single();
    if (depErr) throw depErr;

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: data.amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: `MH-${dep.id.slice(0, 8)}`,
      TransactionDesc: "MineHub Deposit",
    };

    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      await supabaseAdmin.from("deposits").update({ status: "failed", metadata: json }).eq("id", dep.id);
      const msg = json.errorMessage ?? "STK push failed";
      if (String(msg).toLowerCase().includes("invalid access token")) {
        throw new Error("M-Pesa rejected the token. Your MPESA_ENV likely doesn't match your MPESA_CONSUMER_KEY/SECRET (sandbox vs production). Update the secrets and retry.");
      }
      throw new Error(msg);
    }
    if (json.errorCode && isMpesaTerminalFailure(json.errorCode, json.errorCode, json.errorMessage)) {
      await supabaseAdmin.from("deposits").update({ status: "failed", metadata: json }).eq("id", dep.id);
      throw new Error(json.errorMessage ?? "STK push failed");
    }

    const checkoutId = json.CheckoutRequestID as string;
    await supabaseAdmin.from("deposits").update({
      checkout_request_id: checkoutId,
      merchant_request_id: json.MerchantRequestID,
    }).eq("id", dep.id);

    // Poll STK status inline so the client sees instant success once the user pays
    const queryBody = () => {
      const { timestamp: ts, password: pw } = tsAndPassword(shortcode, passkey);
      return { BusinessShortCode: shortcode, Password: pw, Timestamp: ts, CheckoutRequestID: checkoutId };
    };
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const qr = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(queryBody()),
        });
        const q = await qr.json() as any;
        const rc = q?.ResultCode ?? q?.errorCode;
        if (rc === "0" || rc === 0) {
          // Credit now (idempotent — callback also guards on status=pending)
          const { data: fresh } = await supabaseAdmin.from("deposits").select("*").eq("id", dep.id).maybeSingle();
          if (fresh && fresh.status === "pending") {
            await supabaseAdmin.from("deposits").update({ status: "success", metadata: q }).eq("id", dep.id);
            const { data: w } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
            if (w) {
              await supabaseAdmin.from("wallets").update({
                balance: Number(w.balance) + Number(data.amount),
                total_deposited: Number(w.total_deposited) + Number(data.amount),
              }).eq("user_id", userId);
              await supabaseAdmin.from("transactions").insert({
                user_id: userId, kind: "deposit", amount: Number(data.amount),
                description: `M-Pesa deposit`, ref_id: dep.id,
              });
            }
          }
          return { ok: true, status: "success", deposit_id: dep.id };
        }
        if (isMpesaTerminalFailure(rc, q?.errorCode, q?.ResultDesc ?? q?.errorMessage)) {
          await supabaseAdmin.from("deposits").update({ status: "failed", metadata: q }).eq("id", dep.id);
          return { ok: false, status: "failed", deposit_id: dep.id, message: q?.ResultDesc ?? q?.errorMessage ?? "Payment not completed" };
        }
      } catch {
        // keep polling
      }
    }

    return { ok: true, status: "pending", deposit_id: dep.id, checkout_request_id: checkoutId };
  });
