import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, ShieldAlert, XCircle } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminListKycVerifications, adminReviewKycVerification } from "@/lib/admin.functions";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/kyc")({
  beforeLoad: requireAdminRoute,
  component: AdminKyc,
});

function AdminKyc() {
  const listFn = useServerFn(adminListKycVerifications);
  const reviewFn = useServerFn(adminReviewKycVerification);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-kyc"], queryFn: () => listFn() });
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const review = useMutation({
    mutationFn: (args: { id: string; status: "approved" | "rejected"; reason?: string }) =>
      reviewFn({ data: args }),
    onSuccess: () => {
      toast.success("KYC review saved");
      qc.invalidateQueries({ queryKey: ["admin-kyc"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Review failed"),
  });

  const pending = (data ?? []).filter((row: any) => row.status === "pending").length;

  return (
    <AdminShell title="KYC Approval">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Pending" value={pending} />
        <Stat label="Approved" value={(data ?? []).filter((row: any) => row.status === "approved").length} />
        <Stat label="Rejected" value={(data ?? []).filter((row: any) => row.status === "rejected").length} />
      </div>

      <div className="space-y-4">
        {isLoading && <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading...</div>}
        {(data ?? []).map((row: any) => (
          <article key={row.id} className="glass-card rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{row.profile?.full_name || "Unnamed client"}</div>
                <div className="text-sm text-muted-foreground">{row.profile?.email}</div>
                <div className="text-xs text-muted-foreground">{row.profile?.phone || "No phone"} - Submitted {new Date(row.submitted_at).toLocaleString()}</div>
              </div>
              <StatusBadge status={row.status} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <DocumentPreview title="ID front" url={row.documents?.front} />
              <DocumentPreview title="ID back" url={row.documents?.back} />
              <DocumentPreview title="Selfie holding ID" url={row.documents?.selfie} />
            </div>

            {row.status === "rejected" && (
              <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                Reason: {row.rejection_reason || "No reason recorded"}
              </div>
            )}

            {row.status === "pending" && (
              <div className="mt-4 space-y-3">
                <Textarea
                  value={reasons[row.id] ?? ""}
                  onChange={(e) => setReasons((s) => ({ ...s, [row.id]: e.target.value }))}
                  placeholder="Write rejection reason before rejecting"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => review.mutate({ id: row.id, status: "approved" })}
                    disabled={review.isPending}
                    className="gap-2 bg-success text-success-foreground hover:bg-success/90"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    onClick={() => review.mutate({ id: row.id, status: "rejected", reason: reasons[row.id] })}
                    disabled={review.isPending}
                    variant="destructive"
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </article>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">No KYC submissions yet.</div>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

function DocumentPreview({ title, url }: { title: string; url: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-semibold">
        {title}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-primary" aria-label={`Open ${title}`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img src={url} alt={title} className="h-56 w-full object-cover" />
        </a>
      ) : (
        <div className="grid h-56 place-items-center text-sm text-muted-foreground">Preview unavailable</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-success/15 text-success"
      : status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-warning/20 text-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase ${cls}`}>
      {status === "approved" ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {status}
    </span>
  );
}
