CREATE INDEX IF NOT EXISTS idx_copy_trades_open_due
  ON public.copy_trades(status, closes_at, last_profit_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_copy_trades_open_user_due
  ON public.copy_trades(user_id, closes_at, last_profit_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_copy_trade_signals_active_expires
  ON public.copy_trade_signals(active, expires_at);

CREATE OR REPLACE FUNCTION public.copy_trade_term_days(_trade_type TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _trade_type = 'daily' THEN 1
    WHEN _trade_type = 'locked7' THEN 7
    ELSE 30
  END
$$;

CREATE OR REPLACE FUNCTION public.copy_trade_label(_trade_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _trade_type = 'daily' THEN '30-minute copy trade'
    WHEN _trade_type = 'locked7' THEN '7-day locked copy trade'
    ELSE '30-day locked copy trade'
  END
$$;

CREATE OR REPLACE FUNCTION public.copy_trade_earned_profit(
  _amount NUMERIC,
  _profit_rate NUMERIC,
  _trade_type TEXT,
  _opened_at TIMESTAMPTZ,
  _effective_close_at TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT round(
    CASE
      WHEN _trade_type = 'daily' THEN _amount * _profit_rate
      ELSE _amount
        * _profit_rate
        * LEAST(
            public.copy_trade_term_days(_trade_type),
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_effective_close_at - _opened_at)) / 86400.0))::INTEGER
          )
    END,
    2
  )
$$;

CREATE OR REPLACE FUNCTION public.open_copy_trade_atomic(
  _user_id UUID,
  _signal_id UUID,
  _code_entered TEXT,
  _trade_type TEXT,
  _amount NUMERIC,
  _profit_rate NUMERIC,
  _closes_at TIMESTAMPTZ,
  _description TEXT
)
RETURNS public.copy_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade public.copy_trades;
  v_wallet_rows INTEGER;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required.';
  END IF;

  IF _trade_type NOT IN ('daily', 'locked7', 'locked30') THEN
    RAISE EXCEPTION 'Invalid copy trade type.';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Copy trade amount must be positive.';
  END IF;

  UPDATE public.wallets
  SET balance = round(balance - _amount, 2),
      updated_at = now()
  WHERE user_id = _user_id
    AND balance >= _amount;

  GET DIAGNOSTICS v_wallet_rows = ROW_COUNT;
  IF v_wallet_rows = 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.copy_trades (
    user_id,
    signal_id,
    code_entered,
    trade_type,
    amount,
    profit_rate,
    closes_at,
    status
  )
  VALUES (
    _user_id,
    _signal_id,
    COALESCE(_code_entered, ''),
    _trade_type,
    round(_amount, 2),
    _profit_rate,
    _closes_at,
    'open'
  )
  RETURNING * INTO v_trade;

  INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
  VALUES (
    _user_id,
    CASE WHEN _signal_id IS NULL THEN 'copy_trade_loss' ELSE 'copy_trade_open' END,
    -round(_amount, 2),
    _description,
    v_trade.id
  );

  RETURN v_trade;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_copy_trades_batch(
  _user_id UUID DEFAULT NULL,
  _batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(_batch_size, 1000), 1), 5000);
  v_trade RECORD;
  v_close_reached BOOLEAN;
  v_signal_expired BOOLEAN;
  v_signal_inactive BOOLEAN;
  v_has_winning_signal BOOLEAN;
  v_effective_close_at TIMESTAMPTZ;
  v_elapsed_days INTEGER;
  v_profit_remaining NUMERIC;
  v_credit NUMERIC;
  v_profit_only NUMERIC;
  v_status TEXT;
  v_last_profit_at TIMESTAMPTZ;
  v_bonus NUMERIC;
  v_wallet_rows INTEGER;
  v_settled INTEGER := 0;
  v_profit_events INTEGER := 0;
  v_loss_events INTEGER := 0;
  v_expired_signals INTEGER := 0;
BEGIN
  FOR v_trade IN
    SELECT
      ct.*,
      cts.active AS signal_active,
      cts.expires_at AS signal_expires_at,
      p.referred_by
    FROM public.copy_trades ct
    LEFT JOIN public.copy_trade_signals cts ON cts.id = ct.signal_id
    LEFT JOIN public.profiles p ON p.id = ct.user_id
    WHERE ct.status = 'open'
      AND (_user_id IS NULL OR ct.user_id = _user_id)
      AND (
        ct.closes_at <= v_now
        OR cts.expires_at <= v_now
        OR cts.active = false
        OR (ct.trade_type <> 'daily' AND ct.last_profit_at <= v_now - INTERVAL '1 day')
      )
    ORDER BY ct.closes_at ASC, ct.last_profit_at ASC
    LIMIT v_limit
    FOR UPDATE OF ct SKIP LOCKED
  LOOP
    v_signal_expired := v_trade.signal_expires_at IS NOT NULL AND v_trade.signal_expires_at <= v_now;
    v_signal_inactive :=
      v_trade.signal_id IS NOT NULL AND COALESCE(v_trade.signal_active = false, false);
    v_close_reached := v_trade.closes_at <= v_now OR v_signal_expired OR v_signal_inactive;
    v_has_winning_signal :=
      COALESCE(v_trade.result_override = 'win', false)
      OR (v_trade.signal_id IS NOT NULL AND COALESCE(v_trade.result_override, '') <> 'loss');

    IF v_signal_expired THEN
      v_effective_close_at := LEAST(v_trade.closes_at, v_trade.signal_expires_at);
    ELSE
      v_effective_close_at := v_trade.closes_at;
    END IF;

    IF NOT v_has_winning_signal THEN
      IF NOT v_close_reached THEN
        CONTINUE;
      END IF;

      UPDATE public.copy_trades
      SET status = 'lost',
          last_profit_at = v_trade.closes_at
      WHERE id = v_trade.id
        AND status = 'open';

      INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
      VALUES (
        v_trade.user_id,
        'copy_trade_loss',
        0,
        CASE
          WHEN v_trade.result_override = 'loss'
            THEN 'Closed ' || public.copy_trade_label(v_trade.trade_type) || ' as an admin-set loss'
          ELSE 'Closed ' || public.copy_trade_label(v_trade.trade_type) || ' as a loss'
        END,
        v_trade.id
      );

      v_settled := v_settled + 1;
      v_loss_events := v_loss_events + 1;
      CONTINUE;
    END IF;

    v_credit := 0;
    v_profit_only := 0;
    v_status := 'open';
    v_last_profit_at := v_trade.last_profit_at;

    IF v_trade.trade_type = 'daily' THEN
      IF NOT v_close_reached THEN
        CONTINUE;
      END IF;

      v_profit_remaining := GREATEST(
        0,
        public.copy_trade_earned_profit(
          v_trade.amount,
          v_trade.profit_rate,
          v_trade.trade_type,
          v_trade.opened_at,
          v_effective_close_at
        ) - COALESCE(v_trade.total_profit_paid, 0)
      );
      v_credit := round(v_trade.amount + v_profit_remaining, 2);
      v_profit_only := v_profit_remaining;
      v_status := 'won';
      v_last_profit_at := v_effective_close_at;
    ELSE
      v_elapsed_days := FLOOR(
        EXTRACT(EPOCH FROM (LEAST(v_now, v_trade.closes_at) - COALESCE(v_trade.last_profit_at, v_trade.opened_at))) / 86400.0
      )::INTEGER;

      IF v_close_reached THEN
        v_profit_remaining := GREATEST(
          0,
          public.copy_trade_earned_profit(
            v_trade.amount,
            v_trade.profit_rate,
            v_trade.trade_type,
            v_trade.opened_at,
            v_effective_close_at
          ) - COALESCE(v_trade.total_profit_paid, 0)
        );
        v_credit := round(v_trade.amount + v_profit_remaining, 2);
        v_profit_only := v_profit_remaining;
        v_status := 'won';
        v_last_profit_at := v_effective_close_at;
      ELSE
        v_profit_only := round(v_trade.amount * v_trade.profit_rate * GREATEST(0, v_elapsed_days), 2);
        v_credit := v_profit_only;
        v_last_profit_at := COALESCE(v_trade.last_profit_at, v_trade.opened_at)
          + (GREATEST(0, v_elapsed_days) || ' days')::INTERVAL;
      END IF;
    END IF;

    IF v_credit <= 0 AND v_status = 'open' THEN
      CONTINUE;
    END IF;

    UPDATE public.wallets
    SET balance = round(balance + v_credit, 2),
        total_earned = round(total_earned + v_profit_only, 2),
        updated_at = v_now
    WHERE user_id = v_trade.user_id;

    GET DIAGNOSTICS v_wallet_rows = ROW_COUNT;
    IF v_wallet_rows = 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.copy_trades
    SET status = v_status,
        last_profit_at = v_last_profit_at,
        total_profit_paid = round(COALESCE(total_profit_paid, 0) + v_profit_only, 2)
    WHERE id = v_trade.id
      AND status = 'open';

    INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
    VALUES (
      v_trade.user_id,
      'copy_trade_profit',
      v_credit,
      CASE
        WHEN v_status = 'won' AND v_trade.result_override = 'win'
          THEN 'Closed ' || public.copy_trade_label(v_trade.trade_type) || ' as an admin-set win'
        WHEN v_status = 'won' AND v_signal_expired
          THEN 'Closed ' || public.copy_trade_label(v_trade.trade_type) || ' because signal code expired'
        WHEN v_status = 'won'
          THEN 'Closed ' || public.copy_trade_label(v_trade.trade_type)
        ELSE 'Daily profit from ' || public.copy_trade_label(v_trade.trade_type)
      END,
      v_trade.id
    );

    v_profit_events := v_profit_events + 1;
    IF v_status = 'won' THEN
      v_settled := v_settled + 1;
    END IF;

    IF v_profit_only > 0 AND v_trade.referred_by IS NOT NULL THEN
      v_bonus := round(v_profit_only * 0.03, 2);
      IF v_bonus > 0 THEN
        UPDATE public.wallets
        SET balance = round(balance + v_bonus, 2),
            total_earned = round(total_earned + v_bonus, 2),
            updated_at = v_now
        WHERE user_id = v_trade.referred_by;

        INSERT INTO public.referral_earnings (
          referrer_id,
          referred_user_id,
          amount,
          package_id,
          user_package_id,
          source_trade_id,
          source
        )
        VALUES (
          v_trade.referred_by,
          v_trade.user_id,
          v_bonus,
          NULL,
          NULL,
          v_trade.id,
          'trade_profit'
        );

        INSERT INTO public.transactions (user_id, kind, amount, description, ref_id)
        VALUES (
          v_trade.referred_by,
          'direct_income',
          v_bonus,
          '3% direct income from referred copy trade profit',
          v_trade.id
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.copy_trade_signals
  SET active = false
  WHERE active = true
    AND expires_at <= v_now;

  GET DIAGNOSTICS v_expired_signals = ROW_COUNT;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'profitEvents', v_profit_events,
    'lossEvents', v_loss_events,
    'expiredSignals', v_expired_signals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_copy_trades_batch(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_copy_trades_batch(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.settle_copy_trades_batch(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_copy_trades_batch(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.open_copy_trade_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_copy_trade_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.open_copy_trade_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_copy_trade_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) TO service_role;
