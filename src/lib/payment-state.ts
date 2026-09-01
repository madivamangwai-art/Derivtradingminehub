export type WalletActivityItem = {
  id: string;
  kind: "deposit" | "withdrawal" | "payout" | "purchase" | "referral" | "bonus" | "transaction";
  title: string;
  amount: number;
  status: string;
  created_at: string;
  meta?: Record<string, unknown>;
};

function normalizeStatus(status?: string | null) {
  if (!status) return "pending";
  const s = String(status).toLowerCase();
  if (s === "success" || s === "paid" || s === "completed") return "success";
  if (s === "failed" || s === "rejected" || s === "cancelled") return "failed";
  if (s === "processing" || s === "queued" || s === "in_progress" || s === "submitted") return "processing";
  return "pending";
}

export function buildWalletActivityItems(
  deposits: Array<Record<string, any>>,
  withdrawals: Array<Record<string, any>>,
  transactions: Array<Record<string, any>>,
): WalletActivityItem[] {
  const items: WalletActivityItem[] = [];
  const seen = new Set<string>();

  const pushItem = (entry: WalletActivityItem) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    items.push(entry);
  };

  const latestDeposits = [...(deposits ?? [])]
    .filter((dep) => dep?.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  for (const dep of latestDeposits) {
    const status = normalizeStatus(dep.status);
    pushItem({
      id: dep.id,
      kind: "deposit",
      title: status === "success" ? "M-Pesa deposit" : status === "failed" ? "M-Pesa deposit failed" : "M-Pesa deposit pending",
      amount: Number(dep.amount ?? 0),
      status,
      created_at: dep.created_at,
      meta: { phone: dep.mpesa_phone, receipt: dep.mpesa_receipt },
    });
  }

  const latestWithdrawals = [...(withdrawals ?? [])]
    .filter((wd) => wd?.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  for (const wd of latestWithdrawals) {
    const status = normalizeStatus(wd.status);
    pushItem({
      id: wd.id,
      kind: "withdrawal",
      title: status === "success" ? "Withdrawal completed" : status === "failed" ? "Withdrawal failed" : "Withdrawal pending",
      amount: -Number(wd.amount ?? 0),
      status,
      created_at: wd.created_at,
      meta: { phone: wd.mpesa_phone },
    });
  }

  const latestTransactions = [...(transactions ?? [])]
    .filter((tx) => tx?.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  for (const tx of latestTransactions) {
    const kind = String(tx.kind ?? "transaction");
    if (kind === "deposit" || kind === "withdrawal") continue;
    pushItem({
      id: tx.id,
      kind: kind as WalletActivityItem["kind"],
      title: tx.description ?? kind,
      amount: Number(tx.amount ?? 0),
      status: "posted",
      created_at: tx.created_at,
      meta: { ref_id: tx.ref_id },
    });
  }

  return items.sort((a, b) => {
    const aPending = a.status === "pending" ? 0 : 1;
    const bPending = b.status === "pending" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
