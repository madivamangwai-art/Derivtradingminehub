import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export function getFriendlyAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("missing supabase environment variable") || text.includes("missing supabase") || text.includes("service role key")) {
    return "Signup is temporarily unavailable because the authentication service is not configured. Please contact support.";
  }

  if (text.includes("email") && text.includes("already") && text.includes("registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (text.includes("weak_password") || (text.includes("password") && text.includes("least 6"))) {
    return "Please choose a stronger password with at least 6 characters.";
  }

  if (text.includes("invalid_credentials") || text.includes("invalid login") || text.includes("wrong password")) {
    return "The email or password you entered is incorrect.";
  }

  if (text.includes("network") || text.includes("fetch") || text.includes("timed out")) {
    return "We couldn’t reach the service right now. Please check your connection and try again.";
  }

  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts were made. Please wait a moment and try again.";
  }

  return "We couldn’t complete that request. Please try again in a moment.";
}

async function createInitialUserRecords(supabaseAdmin: any, userId: string, email: string, fullName: string, phone: string, refCode?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedRefCode = refCode?.trim().toUpperCase();
  let referredBy: string | null = null;

  if (trimmedRefCode) {
    const { data: referrer } = await supabaseAdmin.from("profiles").select("id").eq("referral_code", trimmedRefCode).maybeSingle();
    if (referrer?.id) referredBy = referrer.id;
  }

  let referralCode = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const prefix = (fullName || normalizedEmail || "USER")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4)
      .padEnd(3, "X");
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    referralCode = `${prefix}${suffix}`;
    const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("referral_code", referralCode).maybeSingle();
    if (!existing) break;
  }

  await supabaseAdmin.from("profiles").upsert({
    id: userId,
    email: normalizedEmail,
    full_name: fullName.trim(),
    phone: phone.trim(),
    referral_code: referralCode,
    referred_by: referredBy,
  }, { onConflict: "id" });

  await supabaseAdmin.from("wallets").upsert({
    user_id: userId,
    balance: 0,
    total_earned: 0,
    total_deposited: 0,
    total_withdrawn: 0,
  }, { onConflict: "user_id" });

  await supabaseAdmin.from("user_roles").upsert({
    user_id: userId,
    role: "client",
  }, { onConflict: "user_id,role" });
}

export const createAccountWithoutConfirmation = createServerFn({ method: "POST" })
  .inputValidator((data: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    refCode?: string;
  }) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6).max(72),
        fullName: z.string().min(1).max(80),
        phone: z.string().min(1).max(15),
        refCode: z.string().max(20).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          phone: data.phone,
          referred_by_code: data.refCode?.trim().toUpperCase() || undefined,
        },
      });

      if (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldFallbackToPublicSignup = /missing supabase|service role key|not configured|invalid api key|not found/i.test(message);

        if (!shouldFallbackToPublicSignup) {
          console.error("Account creation failed", error);
          throw error;
        }
      } else if (created.user) {
        await createInitialUserRecords(
          supabaseAdmin,
          created.user.id,
          data.email,
          data.fullName,
          data.phone,
          data.refCode,
        );

        return { ok: true, userId: created.user.id };
      }

      const { data: publicSignupData, error: publicSignupError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            phone: data.phone,
            referred_by_code: data.refCode?.trim().toUpperCase() || undefined,
          },
        },
      });

      if (publicSignupError) {
        console.error("Public signup fallback failed", publicSignupError);
        throw publicSignupError;
      }

      if (!publicSignupData.user) {
        throw new Error("Account creation failed.");
      }

      return { ok: true, userId: publicSignupData.user.id };
    } catch (error) {
      console.error("Account creation failed", error);
      throw new Error(getFriendlyAuthMessage(error));
    }
  });

