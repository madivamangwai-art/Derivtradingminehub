import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async () => {
    await requireAdminRoute();
    throw redirect({ to: "/admin/clients" });
  },
});
