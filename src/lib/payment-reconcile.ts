type AdminClient = any;

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function markDepositSuccess(
  supabaseAdmin: AdminClient,
  {
    userId,
    depositId,
    amount,
    receipt,
    metadata,
    description,
  }: {
    userId: string;
    depositId: string;
    amount: number;
    receipt?: string | null;
    metadata?: unknown;
    description?: string | null;
  },
) {
  void userId;
  const { data: dep } = await supabaseAdmin
    .from("deposits")
    .select("*")
    .eq("id", depositId)
    .maybeSingle();
  if (!dep) return { changed: false, reason: "missing-deposit" };

  if (String(dep.status ?? "").toLowerCase() !== "success") {
    const amt = toNumber(amount || dep.amount);
    const { data: result, error } = await supabaseAdmin.rpc("mark_deposit_success_once", {
      _deposit_id: depositId,
      _amount: amt,
      _receipt: receipt ?? dep.mpesa_receipt ?? null,
      _metadata: metadata ?? dep.metadata ?? null,
      _description: description ?? `M-Pesa deposit${receipt ? ` ${receipt}` : ""}`.trim(),
    });
    if (error) throw error;
    return result;
  }

  return { changed: false, reason: "already-recorded" };
}

export async function markWithdrawalSuccess(
  supabaseAdmin: AdminClient,
  {
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
  },
) {
  void userId;
  const { data: wd } = await supabaseAdmin
    .from("withdrawals")
    .select("*")
    .eq("id", withdrawalId)
    .maybeSingle();
  if (!wd) return { changed: false, reason: "missing-withdrawal" };

  if (String(wd.status ?? "").toLowerCase() !== "success") {
    const amt = toNumber(amount || wd.amount);
    const { data: result, error } = await supabaseAdmin.rpc("mark_withdrawal_success_once", {
      _withdrawal_id: withdrawalId,
      _amount: amt,
      _metadata: metadata ?? wd.metadata ?? null,
      _provider_reference: providerReference ?? null,
      _admin_note: resultDesc ? String(resultDesc) : "Payout completed.",
    });
    if (error) throw error;
    return result;
  }

  return { changed: false, reason: "already-recorded" };
}

export async function reconcilePendingWalletActivity(supabaseAdmin: AdminClient, userId: string) {
  const [{ data: deposits }, { data: withdrawals }] = await Promise.all([
    supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false }),
  ]);

  let depositUpdates = 0;
  let withdrawalUpdates = 0;

  for (const dep of deposits ?? []) {
    let { data: existingTx } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "deposit")
      .eq("ref_id", dep.id)
      .maybeSingle();
    // fuzzy match if ref_id wasn't set: match by amount and timestamp proximity
    if (!existingTx) {
      const from = new Date(new Date(dep.created_at).getTime() - 60 * 1000).toISOString();
      const to = new Date(new Date(dep.created_at).getTime() + 5 * 60 * 1000).toISOString();
      const { data: fuzzy } = await supabaseAdmin
        .from("transactions")
        .select("id,created_at,amount,ref_id")
        .eq("user_id", userId)
        .eq("kind", "deposit")
        .eq("amount", Number(dep.amount))
        .gte("created_at", from)
        .lte("created_at", to)
        .limit(1);
      existingTx = (fuzzy ?? [])[0] ?? null;
    }
    if (existingTx) {
      await supabaseAdmin.from("deposits").update({ status: "success" }).eq("id", dep.id);
      depositUpdates += 1;
    }
  }

  for (const wd of withdrawals ?? []) {
    let { data: existingTx } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "withdrawal")
      .eq("ref_id", wd.id)
      .maybeSingle();
    if (!existingTx) {
      const from = new Date(new Date(wd.created_at).getTime() - 60 * 1000).toISOString();
      const to = new Date(new Date(wd.created_at).getTime() + 5 * 60 * 1000).toISOString();
      const { data: fuzzy } = await supabaseAdmin
        .from("transactions")
        .select("id,created_at,amount,ref_id")
        .eq("user_id", userId)
        .eq("kind", "withdrawal")
        .eq("amount", -Number(wd.amount))
        .gte("created_at", from)
        .lte("created_at", to)
        .limit(1);
      existingTx = (fuzzy ?? [])[0] ?? null;
    }
    if (existingTx) {
      await supabaseAdmin.from("withdrawals").update({ status: "success" }).eq("id", wd.id);
      withdrawalUpdates += 1;
    }
  }

  return { depositUpdates, withdrawalUpdates };
}
