type AdminClient = any;

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function markDepositSuccess(supabaseAdmin: AdminClient, {
  userId,
  depositId,
  amount,
  receipt,
  metadata,
}: {
  userId: string;
  depositId: string;
  amount: number;
  receipt?: string | null;
  metadata?: unknown;
}) {
  const { data: dep } = await supabaseAdmin.from("deposits").select("*").eq("id", depositId).maybeSingle();
  if (!dep) return { changed: false, reason: "missing-deposit" };

  const { data: existingTx } = await supabaseAdmin.from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "deposit")
    .eq("ref_id", depositId)
    .maybeSingle();

  const shouldCredit = String(dep.status ?? "").toLowerCase() !== "success" || !existingTx;

  if (shouldCredit) {
    const amt = toNumber(amount || dep.amount);
    await supabaseAdmin.from("deposits").update({
      status: "success",
      mpesa_receipt: receipt ?? dep.mpesa_receipt ?? null,
      amount: amt,
      metadata,
    }).eq("id", depositId);

    if (!existingTx) {
      const { data: wallet } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
      if (wallet) {
        await supabaseAdmin.from("wallets").update({
          balance: toNumber(wallet.balance) + amt,
          total_deposited: toNumber(wallet.total_deposited) + amt,
        }).eq("user_id", userId);
      }
      await supabaseAdmin.from("transactions").insert({
        user_id: userId,
        kind: "deposit",
        amount: amt,
        description: `M-Pesa deposit${receipt ? ` ${receipt}` : ""}`.trim(),
        ref_id: depositId,
      });
    }
    return { changed: true, reason: existingTx ? "status-updated" : "credited" };
  }

  return { changed: false, reason: "already-recorded" };
}

export async function markWithdrawalSuccess(supabaseAdmin: AdminClient, {
  userId,
  withdrawalId,
  amount,
  metadata,
  providerReference,
  resultDesc,
}: {
  userId: string;
  withdrawalId: string;
  amount: number;
  metadata?: unknown;
  providerReference?: string | null;
  resultDesc?: string | null;
}) {
  const { data: wd } = await supabaseAdmin.from("withdrawals").select("*").eq("id", withdrawalId).maybeSingle();
  if (!wd) return { changed: false, reason: "missing-withdrawal" };

  const { data: existingTx } = await supabaseAdmin.from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "withdrawal")
    .eq("ref_id", withdrawalId)
    .maybeSingle();

  const shouldDebit = String(wd.status ?? "").toLowerCase() !== "success" || !existingTx;
  if (shouldDebit) {
    const amt = toNumber(amount || wd.amount);
    const { data: wallet } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (wallet) {
      await supabaseAdmin.from("wallets").update({
        balance: toNumber(wallet.balance) - amt,
        total_withdrawn: toNumber(wallet.total_withdrawn) + amt,
      }).eq("user_id", userId);
    }
    await supabaseAdmin.from("withdrawals").update({
      status: "success",
      admin_note: resultDesc ? String(resultDesc) : "Payout completed.",
      provider_reference: providerReference ?? null,
      metadata,
    }).eq("id", withdrawalId);

    if (!existingTx) {
      await supabaseAdmin.from("transactions").insert({
        user_id: userId,
        kind: "withdrawal",
        amount: -amt,
        description: "Withdrawal completed",
        ref_id: withdrawalId,
      });
    }
    return { changed: true, reason: existingTx ? "status-updated" : "debited" };
  }

  return { changed: false, reason: "already-recorded" };
}

export async function reconcilePendingWalletActivity(supabaseAdmin: AdminClient, userId: string) {
  const [{ data: deposits }, { data: withdrawals }] = await Promise.all([
    supabaseAdmin.from("deposits").select("*").eq("user_id", userId).in("status", ["pending", "processing"]).order("created_at", { ascending: false }),
    supabaseAdmin.from("withdrawals").select("*").eq("user_id", userId).in("status", ["pending", "processing"]).order("created_at", { ascending: false }),
  ]);

  let depositUpdates = 0;
  let withdrawalUpdates = 0;

  for (const dep of deposits ?? []) {
    const { data: existingTx } = await supabaseAdmin.from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "deposit")
      .eq("ref_id", dep.id)
      .maybeSingle();
    if (existingTx) {
      await supabaseAdmin.from("deposits").update({ status: "success" }).eq("id", dep.id);
      depositUpdates += 1;
    }
  }

  for (const wd of withdrawals ?? []) {
    const { data: existingTx } = await supabaseAdmin.from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "withdrawal")
      .eq("ref_id", wd.id)
      .maybeSingle();
    if (existingTx) {
      await supabaseAdmin.from("withdrawals").update({ status: "success" }).eq("id", wd.id);
      withdrawalUpdates += 1;
    }
  }

  return { depositUpdates, withdrawalUpdates };
}
