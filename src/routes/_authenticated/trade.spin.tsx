import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trade/spin")({
  beforeLoad: () => {
    throw redirect({ to: "/trade/redpacket" });
  },
});
