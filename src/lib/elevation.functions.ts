import { createServerFn } from "@tanstack/react-start";

export const elevateSelfToAdmin = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error("Admin access can only be granted by an existing admin.");
});

export const isReferralRequired = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return { required: (count ?? 0) > 0 };
});
