import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ImageUp, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminDeleteCopyTradeAnalyst,
  adminGenerateCopyTradeSignal,
  adminGetCopyTrading,
  adminUploadCopyTradeAnalystAvatar,
  adminUpsertCopyTradeAnalyst,
} from "@/lib/admin.functions";
import { requireAdminRoute } from "@/lib/admin-route";

export const Route = createFileRoute("/_authenticated/admin/packages")({
  beforeLoad: requireAdminRoute,
  component: CopyTradingAdminPage,
});

const emptyAnalyst = {
  name: "",
  title: "Portfolio Manager",
  avatar_url: "",
  bio: "",
  one_day_return_rate: 0.02,
  seven_day_roi: 0.14,
  follow_period_days: null as number | null,
  commission_rate: 0,
  min_copy_amount: 1,
  max_copy_amount: null as number | null,
  active: true,
  sort_order: 0,
};

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop()! : result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function getImageMimeType(file: File) {
  if (imageMimeTypes.includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function CopyTradingAdminPage() {
  const qc = useQueryClient();
  const copyTradingFn = useServerFn(adminGetCopyTrading);
  const generateSignalFn = useServerFn(adminGenerateCopyTradeSignal);
  const upsertAnalystFn = useServerFn(adminUpsertCopyTradeAnalyst);
  const uploadAvatarFn = useServerFn(adminUploadCopyTradeAnalystAvatar);
  const deleteAnalystFn = useServerFn(adminDeleteCopyTradeAnalyst);
  const { data } = useQuery({ queryKey: ["admin-copy-trading"], queryFn: () => copyTradingFn() });
  const [analystForm, setAnalystForm] = useState<any>(emptyAnalyst);
  const [analystAvatarFile, setAnalystAvatarFile] = useState<File | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-copy-trading"] });

  const saveAnalyst = useMutation({
    mutationFn: async () => {
      let avatarUrl = analystForm.avatar_url ?? "";
      if (analystAvatarFile) {
        const content = await fileToBase64(analystAvatarFile);
        const uploaded = await uploadAvatarFn({
          data: {
            file_name: analystAvatarFile.name,
            mime_type: getImageMimeType(analystAvatarFile),
            content_base64: content,
          },
        });
        avatarUrl = uploaded.avatar_url;
      }
      return upsertAnalystFn({
        data: {
          ...analystForm,
          avatar_url: avatarUrl,
          commission_rate: Number(analystForm.commission_rate) / 100,
        },
      });
    },
    onSuccess: () => {
      toast.success("Analyst saved");
      setAnalystForm(emptyAnalyst);
      setAnalystAvatarFile(null);
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save analyst"),
  });

  const deleteAnalyst = useMutation({
    mutationFn: (id: string) => deleteAnalystFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Analyst deleted");
      setAnalystForm(emptyAnalyst);
      setAnalystAvatarFile(null);
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete analyst"),
  });

  const generateSignal = useMutation({
    mutationFn: (trade_type: "daily" | "locked7" | "locked30") =>
      generateSignalFn({ data: { trade_type } }),
    onSuccess: (signal: any) => {
      toast.success(`Signal generated: ${signal.code}`);
      navigator.clipboard?.writeText(signal.code);
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not generate signal"),
  });

  return (
    <AdminShell title="Copy Trading Console">
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="glass-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Analyst profiles</h2>
              <p className="text-xs text-muted-foreground">These are the profiles clients see on Copy Trading.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => {
              setAnalystForm(emptyAnalyst);
              setAnalystAvatarFile(null);
            }}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          </div>
          <div className="divide-y divide-border/50">
            {(data?.analysts ?? []).map((analyst: any) => (
              <div key={analyst.id} className="grid gap-3 px-4 py-4 md:grid-cols-[64px_1fr_110px_110px_120px] md:items-center">
                <Avatar analyst={analyst} />
                <div>
                  <div className="font-semibold">{analyst.name}</div>
                  <div className="text-sm text-muted-foreground">{analyst.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{analyst.bio}</div>
                </div>
                <Metric label="1-day" value={`${Number(analyst.one_day_return_rate * 100).toFixed(0)}%`} />
                <Metric label="7-day" value={`${Number(analyst.seven_day_roi * 100).toFixed(0)}%`} />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    setAnalystForm({
                      ...analyst,
                      one_day_return_rate: Number(analyst.one_day_return_rate),
                      seven_day_roi: Number(analyst.seven_day_roi),
                      commission_rate: Number(analyst.commission_rate) * 100,
                      min_copy_amount: Number(analyst.min_copy_amount),
                      max_copy_amount: analyst.max_copy_amount == null ? null : Number(analyst.max_copy_amount),
                    });
                    setAnalystAvatarFile(null);
                  }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    if (confirm(`Delete ${analyst.name}?`)) deleteAnalyst.mutate(analyst.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(data?.analysts ?? []).length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No analyst profiles yet.</div>
            )}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-4">
          <h2 className="text-sm font-semibold">{analystForm.id ? "Edit analyst" : "New analyst"}</h2>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name" value={analystForm.name} onChange={(v) => setAnalystForm({ ...analystForm, name: v })} />
              <Field label="Title" value={analystForm.title} onChange={(v) => setAnalystForm({ ...analystForm, title: v })} />
            </div>
            <AnalystAvatarField
              currentUrl={analystForm.avatar_url ?? ""}
              file={analystAvatarFile}
              onChange={setAnalystAvatarFile}
            />
            <div>
              <Label>Bio</Label>
              <Textarea value={analystForm.bio} onChange={(e) => setAnalystForm({ ...analystForm, bio: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="1-day return" value={analystForm.one_day_return_rate} step="0.01" onChange={(v) => setAnalystForm({ ...analystForm, one_day_return_rate: v })} />
              <NumberField label="7-day ROI" value={analystForm.seven_day_roi} step="0.01" onChange={(v) => setAnalystForm({ ...analystForm, seven_day_roi: v })} />
              <NumberField label="Commission (%)" value={analystForm.commission_rate} step="0.01" onChange={(v) => setAnalystForm({ ...analystForm, commission_rate: v })} />
              <NumberField label="Min amount" value={analystForm.min_copy_amount} onChange={(v) => setAnalystForm({ ...analystForm, min_copy_amount: v })} />
              <NumberField label="Max amount" value={analystForm.max_copy_amount ?? 0} onChange={(v) => setAnalystForm({ ...analystForm, max_copy_amount: v || null })} />
              <NumberField label="Sort order" value={analystForm.sort_order} onChange={(v) => setAnalystForm({ ...analystForm, sort_order: v })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={analystForm.active} onChange={(e) => setAnalystForm({ ...analystForm, active: e.target.checked })} />
              Active
            </label>
            <Button onClick={() => saveAnalyst.mutate()} disabled={saveAnalyst.isPending} className="w-full gap-2 gradient-gold">
              <Save className="h-4 w-4" /> {saveAnalyst.isPending ? "Uploading..." : "Save analyst"}
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <section className="glass-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Generate signal codes</h2>
          </div>
          <div className="grid gap-2">
            <SignalButton label="Daily 30-minute" hint="Up to 4 codes per day" onClick={() => generateSignal.mutate("daily")} disabled={generateSignal.isPending} />
            <SignalButton label="7-day locked" hint="One active code at a time" onClick={() => generateSignal.mutate("locked7")} disabled={generateSignal.isPending} />
            <SignalButton label="30-day locked" hint="One active code at a time" onClick={() => generateSignal.mutate("locked30")} disabled={generateSignal.isPending} />
          </div>
        </section>

        <section className="glass-card overflow-hidden rounded-2xl">
          <div className="grid grid-cols-[112px_86px_1fr_96px_88px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
            <div>Code</div>
            <div>Type</div>
            <div>Expires</div>
            <div>Status</div>
            <div>Copy</div>
          </div>
          {(data?.signals ?? []).slice(0, 12).map((signal: any) => {
            const active = signal.active && new Date(signal.expires_at).getTime() > Date.now();
            return (
              <div key={signal.id} className="grid grid-cols-[112px_86px_1fr_96px_88px] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm">
                <div className="font-mono font-semibold">{signal.code}</div>
                <div className="text-xs capitalize text-primary">{String(signal.trade_type).replace("locked", "locked ")}</div>
                <div className="text-xs text-muted-foreground">{new Date(signal.expires_at).toLocaleString()}</div>
                <StatusPill status={active ? "active" : "expired"} />
                <button className="inline-flex w-fit items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs text-primary" onClick={() => {
                  navigator.clipboard?.writeText(signal.code);
                  toast.success("Copied");
                }}>
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
            );
          })}
        </section>
      </div>

      <section className="mt-4 glass-card overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Copy trading ledger</h2>
            <div className="text-xs text-muted-foreground">
              Open {data?.summary?.openTrades ?? 0} - Won {data?.summary?.wonTrades ?? 0} - Lost {data?.summary?.lostTrades ?? 0}
            </div>
          </div>
          <Metric label="Open profit exposure" value={`KES ${Number(data?.summary?.openDailyOutflow ?? 0).toLocaleString()}`} />
        </div>
        <div className="hidden grid-cols-[1.2fr_96px_88px_96px_1fr_82px] gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid">
          <div>Client</div>
          <div>Type</div>
          <div>Amount</div>
          <div>Code</div>
          <div>Closes</div>
          <div>Status</div>
        </div>
        {(data?.trades ?? []).map((trade: any) => (
          <div key={trade.id} className="grid gap-2 border-b border-border/40 px-4 py-3 text-sm lg:grid-cols-[1.2fr_96px_88px_96px_1fr_82px] lg:items-center">
            <div>
              <div className="font-medium">{trade.profile?.full_name ?? "Unnamed client"}</div>
              <div className="text-[11px] text-muted-foreground">{trade.profile?.phone ?? trade.profile?.email ?? trade.user_id}</div>
            </div>
            <div className="text-xs capitalize text-primary">{String(trade.trade_type).replace("locked", "locked ")}</div>
            <div>KES {Number(trade.amount ?? 0).toLocaleString()}</div>
            <div className="font-mono text-xs">{trade.code_entered}</div>
            <div className="text-xs text-muted-foreground">{new Date(trade.closes_at).toLocaleString()}</div>
            <StatusPill status={trade.status} />
          </div>
        ))}
      </section>
    </AdminShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AnalystAvatarField({
  currentUrl,
  file,
  onChange,
}: {
  currentUrl: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const src = previewUrl || currentUrl;

  return (
    <div>
      <Label>Profile picture</Label>
      <div className="mt-1 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {src ? <img src={src} alt="Analyst preview" className="h-full w-full object-cover" /> : "Photo"}
        </div>
        <div className="min-w-0 flex-1">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
          <div className="mt-1 text-[11px] text-muted-foreground">
            Upload JPG, PNG, or WebP. No link needed.
          </div>
        </div>
        {file ? (
          <Button type="button" size="icon" variant="secondary" onClick={() => onChange(null)} aria-label="Remove selected picture">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <ImageUp className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = "1" }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Avatar({ analyst }: { analyst: any }) {
  return (
    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-muted text-lg font-bold">
      {analyst.avatar_url ? <img src={analyst.avatar_url} alt={analyst.name} className="h-full w-full object-cover" /> : analyst.name.slice(0, 1)}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold text-success">{value}</div>
    </div>
  );
}

function SignalButton({ label, hint, onClick, disabled }: { label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-primary/50 disabled:opacity-60">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <Plus className="h-4 w-4 text-primary" />
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "active" || status === "won" ? "bg-success/15 text-success" : status === "open" ? "bg-primary/15 text-primary" : status === "lost" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] uppercase ${cls}`}>{status}</span>;
}
