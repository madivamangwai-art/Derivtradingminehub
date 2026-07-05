import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readEnvValue } from "@/lib/env";

function mpesaBaseUrl() {
  return (readEnvValue('MPESA_ENV', 'DARAJA_ENV') ?? "sandbox") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

async function getMpesaToken() {
  const key = readEnvValue('MPESA_CONSUMER_KEY', 'DARAJA_CONSUMER_KEY');
  const secret = readEnvValue('MPESA_CONSUMER_SECRET', 'DARAJA_CONSUMER_SECRET');
  if (!key || !secret) throw new Error("M-Pesa credentials not configured.");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`M-Pesa auth failed (${res.status}). ${body.includes("Invalid") ? "Check MPESA_ENV matches your credentials (sandbox vs production)." : ""}`);
  }
  const j = await res.json() as { access_token: string };
  return j.access_token;
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

    const token = await getMpesaToken();
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

    const res = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as any;
    if (!res.ok || json.errorCode) {
      await supabaseAdmin.from("deposits").update({ status: "failed", metadata: json }).eq("id", dep.id);
      const msg = json.errorMessage ?? "STK push failed";
      if (String(msg).toLowerCase().includes("invalid access token")) {
        throw new Error("M-Pesa rejected the token. Your MPESA_ENV likely doesn't match your MPESA_CONSUMER_KEY/SECRET (sandbox vs production). Update the secrets and retry.");
      }
      throw new Error(msg);
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
        const qr = await fetch(`${mpesaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
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
        // Non-zero, non-"still processing" → failed
        if (rc && rc !== "1032" && q?.errorCode !== "500.001.1001") {
          await supabaseAdmin.from("deposits").update({ status: "failed", metadata: q }).eq("id", dep.id);
          return { ok: false, status: "failed", deposit_id: dep.id, message: q?.ResultDesc ?? "Payment not completed" };
        }
      } catch {
        // keep polling
      }
    }

    return { ok: true, status: "pending", deposit_id: dep.id, checkout_request_id: checkoutId };
  });
