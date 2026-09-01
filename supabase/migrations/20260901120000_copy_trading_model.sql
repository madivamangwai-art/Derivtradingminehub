CREATE TABLE IF NOT EXISTS public.copy_trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('daily', 'locked7', 'locked30')),
  profit_rate NUMERIC(8,4) NOT NULL DEFAULT 0.0160,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'copy_trade_open';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'copy_trade_profit';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'copy_trade_loss';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'red_packet_claim';

CREATE TABLE IF NOT EXISTS public.copy_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES public.copy_trade_signals(id) ON DELETE SET NULL,
  code_entered TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('daily', 'locked7', 'locked30')),
  amount NUMERIC(14,2) NOT NULL,
  profit_rate NUMERIC(8,4) NOT NULL DEFAULT 0.0160,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ NOT NULL,
  last_profit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_profit_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'cancelled'))
);

ALTER TABLE public.red_packet_claims
  ADD COLUMN IF NOT EXISTS amount_awarded NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS fee_rate NUMERIC(8,4) NOT NULL DEFAULT 0.2000;

CREATE INDEX IF NOT EXISTS idx_copy_trade_signals_type_active
  ON public.copy_trade_signals(trade_type, active, expires_at);

CREATE INDEX IF NOT EXISTS idx_copy_trades_user_status
  ON public.copy_trades(user_id, status, closes_at);

GRANT SELECT ON public.copy_trade_signals TO authenticated;
GRANT ALL ON public.copy_trade_signals TO service_role;
GRANT SELECT ON public.copy_trades TO authenticated;
GRANT ALL ON public.copy_trades TO service_role;

ALTER TABLE public.copy_trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copy_trade_signals_read" ON public.copy_trade_signals;
CREATE POLICY "copy_trade_signals_read" ON public.copy_trade_signals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "copy_trades_self_view" ON public.copy_trades;
CREATE POLICY "copy_trades_self_view" ON public.copy_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
