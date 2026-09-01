export function buildWalletActivityItems(deposits = [], withdrawals = [], transactions = []) {
  const items = [];

  for (const dep of deposits ?? []) {
    const status = String(dep?.status ?? "pending").toLowerCase();
    items.push({
      id: dep.id,
      kind: "deposit",
      title: status === "success" || status === "paid" || status === "completed" ? "M-Pesa deposit" : "M-Pesa deposit pending",
      amount: Number(dep.amount ?? 0),
      status: status === "success" || status === "paid" || status === "completed" ? "success" : status === "failed" || status === "rejected" ? "failed" : "pending",
      created_at: dep.created_at,
      meta: { phone: dep.mpesa_phone, receipt: dep.mpesa_receipt },
    });
  }

  for (const wd of withdrawals ?? []) {
    const status = String(wd?.status ?? "pending").toLowerCase();
    items.push({
      id: wd.id,
      kind: "withdrawal",
      title: status === "success" || status === "paid" || status === "completed" ? "Withdrawal completed" : "Withdrawal pending",
      amount: -Number(wd.amount ?? 0),
      status: status === "success" || status === "paid" || status === "completed" ? "success" : status === "failed" || status === "rejected" ? "failed" : "pending",
      created_at: wd.created_at,
      meta: { phone: wd.mpesa_phone },
    });
  }

  for (const tx of transactions ?? []) {
    const kind = String(tx.kind ?? "transaction");
    if (kind === "deposit" || kind === "withdrawal") continue;
    items.push({
      id: tx.id,
      kind,
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
