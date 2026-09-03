ALTER TYPE public.txn_status ADD VALUE IF NOT EXISTS 'processing';

CREATE INDEX IF NOT EXISTS idx_transactions_ref_kind_user
  ON public.transactions(ref_id, kind, user_id)
  WHERE ref_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_payment_ref_once
  ON public.transactions(ref_id, kind, user_id)
  WHERE ref_id IS NOT NULL
    AND kind IN ('deposit', 'withdrawal');

CREATE INDEX IF NOT EXISTS idx_deposits_checkout_status
  ON public.deposits(checkout_request_id, status)
  WHERE checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_provider_lookup
  ON public.withdrawals(conversation_id, originator_conversation_id, status);

CREATE OR REPLACE FUNCTION public.adjust_wallet_atomic(
  _user_id UUID,
  _balance_delta NUMERIC DEFAULT 0,
  _earned_delta NUMERIC DEFAULT 0,
  _deposited_delta NUMERIC DEFAULT 0,
  _withdrawn_delta NUMERIC DEFAULT 0,
  _require_sufficient_balance BOOLEAN DEFAULT false
)
RETURNS public.wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets;
BEGIN
  UPDATE public.wallets
  SET balance = round(balance + COALESCE(_balance_delta, 0), 2),
      total_earned = round(total_earned + COALESCE(_earned_delta, 0), 2),
      total_deposited = round(total_deposited + COALESCE(_deposited_delta, 0), 2),
      total_withdrawn = round(total_withdrawn + COALESCE(_withdrawn_delta, 0), 2),
      updated_at = now()
  WHERE user_id = _user_id
    AND (
      NOT COALESCE(_require_sufficient_balance, false)
      OR balance + COALESCE(_balance_delta, 0) >= 0
    )
  RETURNING * INTO v_wallet;

  IF v_wallet.user_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance or wallet missing';
  END IF;

  RETURN v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_deposit_success_once(
  _deposit_id UUID,
  _amount NUMERIC,
  _receipt TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL,
  _description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit public.deposits;
  v_amount NUMERIC;
BEGIN
  UPDATE public.deposits
  SET status = 'success',
      mpesa_receipt = COALESCE(_receipt, mpesa_receipt),
      amount = round(COALESCE(_amount, amount), 2),
      metadata = COALESCE(_metadata, metadata),
      updated_at = now()
  WHERE id = _deposit_id
    AND status <> 'success'
  RETURNING * INTO v_deposit;

  IF v_deposit.id IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'already-recorded');
  END IF;

  v_amount := round(COALESCE(_amount, v_deposit.amount), 2);

  PERFORM public.adjust_wallet_atomic(
    v_deposit.user_id,
    v_amount,
    0,
    v_amount,
    0,
    false
  );

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  SELECT
    v_deposit.user_id,
    'deposit',
    v_amount,
    COALESCE(_description, trim('M-Pesa deposit ' || COALESCE(_receipt, ''))),
    v_deposit.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_deposit.user_id
      AND kind = 'deposit'
      AND ref_id = v_deposit.id
  );

  RETURN jsonb_build_object('changed', true, 'reason', 'credited');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_withdrawal_success_once(
  _withdrawal_id UUID,
  _amount NUMERIC DEFAULT NULL,
  _metadata JSONB DEFAULT NULL,
  _provider_reference TEXT DEFAULT NULL,
  _admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal public.withdrawals;
  v_amount NUMERIC;
BEGIN
  UPDATE public.withdrawals
  SET status = 'success',
      admin_note = COALESCE(_admin_note, admin_note, 'Payout completed.'),
      provider_reference = COALESCE(_provider_reference, provider_reference),
      metadata = COALESCE(_metadata, metadata),
      updated_at = now()
  WHERE id = _withdrawal_id
    AND status <> 'success'
  RETURNING * INTO v_withdrawal;

  IF v_withdrawal.id IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'already-recorded');
  END IF;

  v_amount := round(COALESCE(_amount, v_withdrawal.amount), 2);

  PERFORM public.adjust_wallet_atomic(
    v_withdrawal.user_id,
    -v_amount,
    0,
    0,
    v_amount,
    true
  );

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  SELECT
    v_withdrawal.user_id,
    'withdrawal',
    -v_amount,
    'Withdrawal completed',
    v_withdrawal.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_withdrawal.user_id
      AND kind = 'withdrawal'
      AND ref_id = v_withdrawal.id
  );

  RETURN jsonb_build_object('changed', true, 'reason', 'debited');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_red_packet_atomic(
  _user_id UUID,
  _total_amount NUMERIC,
  _max_claims INTEGER,
  _code TEXT
)
RETURNS public.red_packets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_packet public.red_packets;
  v_ticket_value INTEGER;
BEGIN
  v_ticket_value := FLOOR(_total_amount / _max_claims);
  IF v_ticket_value < 1 THEN
    RAISE EXCEPTION 'Each claim must be worth at least KES 1';
  END IF;

  PERFORM public.adjust_wallet_atomic(_user_id, -_total_amount, 0, 0, 0, true);

  INSERT INTO public.red_packets (
    creator_id,
    code,
    total_amount,
    max_claims,
    ticket_value
  )
  VALUES (
    _user_id,
    _code,
    round(_total_amount, 2),
    _max_claims,
    v_ticket_value
  )
  RETURNING * INTO v_packet;

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  VALUES (
    _user_id,
    'red_packet_create',
    -round(_total_amount, 2),
    'Created red packet ' || _code,
    v_packet.id
  );

  RETURN v_packet;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_red_packet_atomic(
  _user_id UUID,
  _code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_packet public.red_packets;
  v_per_claim NUMERIC;
  v_new_count INTEGER;
BEGIN
  SELECT *
  INTO v_packet
  FROM public.red_packets
  WHERE code = upper(_code)
  FOR UPDATE;

  IF v_packet.id IS NULL THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;
  IF v_packet.creator_id = _user_id THEN
    RAISE EXCEPTION 'You cannot claim your own red packet';
  END IF;
  IF v_packet.status <> 'active' OR v_packet.claimed_count >= v_packet.max_claims THEN
    RAISE EXCEPTION 'Red packet is fully claimed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.red_packet_claims
    WHERE packet_id = v_packet.id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  v_per_claim := FLOOR(v_packet.total_amount / v_packet.max_claims);
  IF v_per_claim < 1 THEN
    RAISE EXCEPTION 'Nothing to claim';
  END IF;

  INSERT INTO public.red_packet_claims (
    packet_id,
    user_id,
    tickets_awarded,
    amount_awarded
  )
  VALUES (
    v_packet.id,
    _user_id,
    0,
    v_per_claim
  );

  v_new_count := v_packet.claimed_count + 1;
  UPDATE public.red_packets
  SET claimed_count = v_new_count,
      status = CASE WHEN v_new_count >= max_claims THEN 'completed' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_packet.id;

  PERFORM public.adjust_wallet_atomic(_user_id, v_per_claim, v_per_claim, 0, 0, false);

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  VALUES (
    _user_id,
    'red_packet_claim',
    v_per_claim,
    'Claimed red packet ' || v_packet.code,
    v_packet.id
  );

  RETURN jsonb_build_object('ok', true, 'amount', v_per_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_spin_tickets_atomic(
  _user_id UUID,
  _value_kes INTEGER,
  _qty INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost NUMERIC;
BEGIN
  IF _qty < 1 OR _qty > 20 THEN
    RAISE EXCEPTION 'Invalid ticket quantity';
  END IF;
  IF _value_kes NOT IN (50, 100, 500, 1000) THEN
    RAISE EXCEPTION 'Invalid ticket value';
  END IF;

  v_cost := _value_kes * _qty;
  PERFORM public.adjust_wallet_atomic(_user_id, -v_cost, 0, 0, 0, true);

  INSERT INTO public.spin_tickets (user_id, value_kes, source)
  SELECT _user_id, _value_kes, 'purchase'
  FROM generate_series(1, _qty);

  INSERT INTO public.transactions (user_id, kind, amount, description)
  VALUES (
    _user_id,
    'spin_ticket',
    -v_cost,
    'Bought ' || _qty || ' x ' || _value_kes || ' spin ticket(s)'
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_package_atomic(
  _user_id UUID,
  _package_id UUID,
  _price NUMERIC,
  _expires_at TIMESTAMPTZ,
  _purchase_limit INTEGER,
  _description TEXT
)
RETURNS public.user_packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_purchase public.user_packages;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::TEXT || ':' || _package_id::TEXT, 0));

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_packages
  WHERE user_id = _user_id
    AND package_id = _package_id;

  IF v_count >= _purchase_limit THEN
    RAISE EXCEPTION 'Package purchase limit reached';
  END IF;

  PERFORM public.adjust_wallet_atomic(_user_id, -_price, 0, 0, 0, true);

  INSERT INTO public.user_packages (user_id, package_id, expires_at)
  VALUES (_user_id, _package_id, _expires_at)
  RETURNING * INTO v_purchase;

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  VALUES (_user_id, 'purchase', -round(_price, 2), _description, v_purchase.id);

  RETURN v_purchase;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_package_payout_atomic(
  _user_id UUID,
  _user_package_id UUID,
  _amount NUMERIC,
  _last_boundary_at TIMESTAMPTZ,
  _previous_last_payout_at TIMESTAMPTZ,
  _status public.pkg_status,
  _description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.user_packages;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Nothing to claim';
  END IF;

  UPDATE public.user_packages
  SET last_payout_at = _last_boundary_at,
      total_paid_out = round(total_paid_out + _amount, 2),
      status = _status
  WHERE id = _user_package_id
    AND user_id = _user_id
    AND status IN ('active', 'completed')
    AND last_payout_at IS NOT DISTINCT FROM _previous_last_payout_at
  RETURNING * INTO v_purchase;

  IF v_purchase.id IS NULL THEN
    RAISE EXCEPTION 'Payout was already claimed. Refresh and try again.';
  END IF;

  PERFORM public.adjust_wallet_atomic(_user_id, _amount, _amount, 0, 0, false);

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  VALUES (_user_id, 'payout', round(_amount, 2), _description, _user_package_id);

  RETURN jsonb_build_object('ok', true, 'amount', round(_amount, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_wallet_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_wallet_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_wallet_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_wallet_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.mark_deposit_success_once(UUID, NUMERIC, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_deposit_success_once(UUID, NUMERIC, TEXT, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_deposit_success_once(UUID, NUMERIC, TEXT, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_deposit_success_once(UUID, NUMERIC, TEXT, JSONB, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.mark_withdrawal_success_once(UUID, NUMERIC, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_withdrawal_success_once(UUID, NUMERIC, JSONB, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_withdrawal_success_once(UUID, NUMERIC, JSONB, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_success_once(UUID, NUMERIC, JSONB, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.create_red_packet_atomic(UUID, NUMERIC, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_red_packet_atomic(UUID, NUMERIC, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.create_red_packet_atomic(UUID, NUMERIC, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_red_packet_atomic(UUID, NUMERIC, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_red_packet_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_red_packet_atomic(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_red_packet_atomic(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_red_packet_atomic(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.buy_spin_tickets_atomic(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_spin_tickets_atomic(UUID, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.buy_spin_tickets_atomic(UUID, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buy_spin_tickets_atomic(UUID, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.purchase_package_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_package_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purchase_package_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_package_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_package_payout_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, public.pkg_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_package_payout_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, public.pkg_status, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_package_payout_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, public.pkg_status, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_package_payout_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, public.pkg_status, TEXT) TO service_role;
