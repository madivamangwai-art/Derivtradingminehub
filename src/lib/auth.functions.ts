import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDetailedAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.toString();
  }

  if (isRecord(error)) {
    const entries: string[] = [];
    if (typeof error.message === "string" && error.message.trim()) {
      entries.push(error.message);
    }
    if (typeof error.code === "string" && error.code.trim()) {
      entries.push(`code=${error.code}`);
    }
    if (typeof error.status === "number") {
      entries.push(`status=${error.status}`);
    }
    if (typeof error.details === "string" && error.details.trim()) {
      entries.push(`details=${error.details}`);
    }
    if (entries.length > 0) return entries.join(" | ");
  }

  return typeof error === "string" ? error : JSON.stringify(error);
}

export function logAuthFailure(stage: string, error: unknown, context?: Record<string, unknown>) {
  console.error(`[auth] ${stage}`, {
    error: getDetailedAuthErrorMessage(error),
    context,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function getFriendlyAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const text = `${code} ${message}`.toLowerCase();

  if (
    text.includes("missing supabase environment variable") ||
    text.includes("missing supabase") ||
    text.includes("service role key")
  ) {
    return "Signup is temporarily unavailable because the authentication service is not configured. Please contact support.";
  }

  if (text.includes("email") && text.includes("already") && text.includes("registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (text.includes("weak_password") || (text.includes("password") && text.includes("least 6"))) {
    return "Please choose a stronger password with at least 6 characters.";
  }

  if (
    text.includes("invalid_credentials") ||
    text.includes("invalid login") ||
    text.includes("wrong password")
  ) {
    return "The email or password you entered is incorrect.";
  }

  if (text.includes("network") || text.includes("fetch") || text.includes("timed out")) {
    return "We couldn't reach the service right now. Please check your connection and try again.";
  }

  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts were made. Please wait a moment and try again.";
  }

  if (
    text.includes("database") ||
    text.includes("trigger") ||
    text.includes("profile") ||
    text.includes("wallet")
  ) {
    return "Your account was created, but setup could not finish. Please contact support.";
  }

  return "We couldn't complete that request. Please try again in a moment.";
}

function throwIfSupabaseError(result: { error?: unknown }, action: string) {
  if (!result.error) return;

  const message = getDetailedAuthErrorMessage(result.error);
  throw new Error(`${action}: ${message}`);
}

type SignupInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  refCode?: string;
};

function parseSignupInput(data: unknown): SignupInput {
  const parsed = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      fullName: z.string().trim().min(1).max(80),
      phone: z.string().trim().min(1).max(15),
      refCode: z.string().trim().max(20).optional(),
    })
    .safeParse(data);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(`Invalid signup payload: ${issues}`);
  }

  return parsed.data;
}

async function createInitialUserRecords(
  supabaseAdmin: any,
  userId: string,
  email: string,
  fullName: string,
  phone: string,
  refCode?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedRefCode = refCode?.trim().toUpperCase();
  let referredBy: string | null = null;

  if (trimmedRefCode) {
    const referrerResult = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", trimmedRefCode)
      .maybeSingle();
    throwIfSupabaseError(referrerResult, "Could not validate referral code");
    if (referrerResult.data?.id) referredBy = referrerResult.data.id;
  }

  let referralCode = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const prefix = (fullName || normalizedEmail || "USER")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4)
      .padEnd(3, "X");
    const suffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    referralCode = `${prefix}${suffix}`;
    const existingResult = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", referralCode)
      .maybeSingle();
    throwIfSupabaseError(existingResult, "Could not generate referral code");
    if (!existingResult.data) break;
  }

  const profileResult = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email: normalizedEmail,
      full_name: fullName.trim(),
      phone: phone.trim(),
      referral_code: referralCode,
      referred_by: referredBy,
    },
    { onConflict: "id" },
  );
  throwIfSupabaseError(profileResult, "Could not create profile");

  const walletResult = await supabaseAdmin.from("wallets").upsert(
    {
      user_id: userId,
      balance: 0,
      total_earned: 0,
      total_deposited: 0,
      total_withdrawn: 0,
    },
    { onConflict: "user_id" },
  );
  throwIfSupabaseError(walletResult, "Could not create wallet");

  const roleResult = await supabaseAdmin.from("user_roles").upsert(
    {
      user_id: userId,
      role: "client",
    },
    { onConflict: "user_id,role" },
  );
  throwIfSupabaseError(roleResult, "Could not assign client role");
}

export const createAccountWithoutConfirmation = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseSignupInput(data))
  .handler(async ({ data }) => {
    const input = data as SignupInput;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          full_name: input.fullName,
          phone: input.phone,
          referred_by_code: input.refCode?.trim().toUpperCase() || undefined,
        },
      });

      if (error) {
        logAuthFailure("signup.createUser", error, {
          email: input.email.trim().toLowerCase(),
          phone: input.phone.trim(),
          refCode: input.refCode?.trim().toUpperCase(),
        });
        throw error;
      }

      if (!created.user) {
        throw new Error("Account creation failed.");
      }

      await createInitialUserRecords(
        supabaseAdmin,
        created.user.id,
        input.email,
        input.fullName,
        input.phone,
        input.refCode,
      );

      return { ok: true, userId: created.user.id };
    } catch (error) {
      const detailMessage = getDetailedAuthErrorMessage(error);
      logAuthFailure("signup.handler", error, {
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        refCode: input.refCode?.trim().toUpperCase(),
      });

      if (process.env.NODE_ENV !== "production" && detailMessage) {
        throw new Error(`Signup failed: ${detailMessage}`);
      }

      throw new Error(getFriendlyAuthMessage(error));
    }
  });
