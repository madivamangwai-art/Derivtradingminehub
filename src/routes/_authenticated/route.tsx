import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // If OAuth returned with a pending ref code (Google flow), stash it via metadata now.
    const pending = typeof window !== "undefined" ? sessionStorage.getItem("pending_ref") : null;
    if (pending) {
      sessionStorage.removeItem("pending_ref");
      try {
        await supabase.from("profiles").update({ referred_by: null }).eq("id", data.user.id).is("referred_by", null);
        // best-effort — resolve code to user id, only if profile currently has no referrer
        const { data: refProf } = await supabase.from("profiles").select("id").eq("referral_code", pending).maybeSingle();
        if (refProf?.id) {
          await supabase.from("profiles").update({ referred_by: refProf.id }).eq("id", data.user.id).is("referred_by", null);
        }
      } catch { /* non-critical */ }
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
