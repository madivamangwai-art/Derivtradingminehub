import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export function getFriendlyAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("email") && text.includes("already") && text.includes("registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (text.includes("weak_password") || text.includes("password") && text.includes("least 6")) {
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
        console.error("Account creation failed", error);
        throw error;
      }

      if (!created.user) {
        throw new Error("Account creation failed.");
      }

      return { userId: created.user.id };
    } catch (error) {
      console.error("Account creation failed", error);
      throw new Error(getFriendlyAuthMessage(error));
    }
  });
