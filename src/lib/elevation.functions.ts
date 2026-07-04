import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Admin elevation password. In production consider moving to a secret.
const ELEVATION_PASSWORD = "Gine@254";

export const elevateSelfToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.password !== ELEVATION_PASSWORD) throw new Error("Incorrect password");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: context.userId, role: "admin" },
      { onConflict: "user_id,role" },
    );
    return { ok: true };
  });

// Public — is referral required for signup? (i.e. at least one user already exists)
export const isReferralRequired = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
    return { required: (count ?? 0) > 0 };
  });
