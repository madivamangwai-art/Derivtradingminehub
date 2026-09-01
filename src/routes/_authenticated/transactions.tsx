import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  HandCoins,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { ClientShell } from "@/components/layout/client-shell";
import { getClientTransactions } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

const fmt = (n: any) =>
  `KES ${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function TransactionsPage() {
  const fn = useServerFn(getClientTransactions);
  const { data, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => fn(),
    refetchInterval: 60000,
  });
  const items = data?.items ?? [];

  return (
    <ClientShell title="Transactions">
      <div className="space-y-3">
        {isLoading && (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No transactions yet.
          </div>
        )}
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone(item.kind, item.amount)}`}>
              <TxnIcon kind={item.kind} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold capitalize">{item.title}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                <span>{item.source}</span>
                <span>-</span>
                <span>{new Date(item.created_at).toLocaleString()}</span>
                <span>-</span>
                <span className="capitalize">{String(item.status).replaceAll("_", " ")}</span>
              </div>
            </div>
            <div className={`text-right text-sm font-bold ${Number(item.amount) >= 0 ? "text-success" : "text-destructive"}`}>
              {Number(item.amount) >= 0 ? "+" : ""}
              {fmt(item.amount)}
            </div>
          </div>
        ))}
      </div>
    </ClientShell>
  );
}

function TxnIcon({ kind }: { kind: string }) {
  if (kind.includes("deposit")) return <ArrowDownToLine className="h-4 w-4" />;
  if (kind.includes("withdraw")) return <ArrowUpFromLine className="h-4 w-4" />;
  if (kind.includes("red_packet") || kind.includes("bonus")) return <Gift className="h-4 w-4" />;
  if (kind.includes("direct") || kind.includes("referral")) return <HandCoins className="h-4 w-4" />;
  if (kind.includes("trade") || kind.includes("profit")) return <TrendingUp className="h-4 w-4" />;
  return <ReceiptText className="h-4 w-4" />;
}

function tone(kind: string, amount: number) {
  if (kind.includes("withdraw") || amount < 0) return "bg-destructive/15 text-destructive";
  if (kind.includes("direct") || kind.includes("referral")) return "bg-primary/15 text-primary";
  return "bg-success/15 text-success";
}
