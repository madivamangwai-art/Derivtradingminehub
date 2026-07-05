import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    if (error) throw error;
    if (!created.user) throw new Error("Account creation failed.");

    return { userId: created.user.id };
  });
