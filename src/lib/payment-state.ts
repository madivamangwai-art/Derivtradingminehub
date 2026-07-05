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
  return "pending";
}

export function buildWalletActivityItems(
  deposits: Array<Record<string, any>>,
  withdrawals: Array<Record<string, any>>,
  transactions: Array<Record<string, any>>,
): WalletActivityItem[] {
  const items: WalletActivityItem[] = [];

  for (const dep of deposits ?? []) {
    items.push({
      id: dep.id,
      kind: "deposit",
      title: normalizeStatus(dep.status) === "success" ? "M-Pesa deposit" : "M-Pesa deposit pending",
      amount: Number(dep.amount ?? 0),
      status: normalizeStatus(dep.status),
      created_at: dep.created_at,
      meta: { phone: dep.mpesa_phone, receipt: dep.mpesa_receipt },
    });
  }

  for (const wd of withdrawals ?? []) {
    items.push({
      id: wd.id,
      kind: "withdrawal",
      title: normalizeStatus(wd.status) === "success" ? "Withdrawal completed" : "Withdrawal pending",
      amount: -Number(wd.amount ?? 0),
      status: normalizeStatus(wd.status),
      created_at: wd.created_at,
      meta: { phone: wd.mpesa_phone },
    });
  }

  for (const tx of transactions ?? []) {
    const kind = String(tx.kind ?? "transaction");
    if (kind === "deposit" || kind === "withdrawal") continue;
    items.push({
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
