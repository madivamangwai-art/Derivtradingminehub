import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetTeamTree } from "@/lib/admin.functions";
import { AdminShell } from "@/components/layout/admin-shell";
import Tree from "react-d3-tree";
import { useMemo } from "react";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  beforeLoad: requireAdminRoute,
  component: TeamsPage,
});

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  referral_code: string;
  referred_by: string | null;
};
type TreeNode = { name: string; attributes?: Record<string, string>; children?: TreeNode[] };

function buildForest(profiles: Profile[]): TreeNode[] {
  const byParent = new Map<string | null, Profile[]>();
  profiles.forEach((p) => {
    const key = p.referred_by;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  });
  const build = (p: Profile): TreeNode => ({
    name: p.full_name || p.email || p.referral_code,
    attributes: { code: p.referral_code },
    children: (byParent.get(p.id) ?? []).map(build),
  });
  return (byParent.get(null) ?? []).map(build);
}

function TeamsPage() {
  const fn = useServerFn(adminGetTeamTree);
  const { data } = useQuery({ queryKey: ["admin-teams"], queryFn: () => fn() });
  const forest = useMemo(() => (data ? buildForest(data as Profile[]) : []), [data]);
  const root: TreeNode = { name: "MineHub", children: forest };

  return (
    <AdminShell title="Teams & Referrals">
      <div className="glass-card h-[75vh] overflow-hidden rounded-2xl">
        {data && data.length > 0 ? (
          <Tree
            data={root}
            orientation="vertical"
            translate={{ x: 400, y: 60 }}
            pathFunc="step"
            zoomable
            collapsible={false}
            separation={{ siblings: 1.2, nonSiblings: 1.6 }}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading team tree…
          </div>
        )}
      </div>
    </AdminShell>
  );
}
