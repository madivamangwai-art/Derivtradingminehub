ALTER TABLE public.copy_trade_signals
  ADD COLUMN IF NOT EXISTS min_copy_amount NUMERIC(14,2) NOT NULL DEFAULT 1;

ALTER TABLE public.copy_trade_signals
  DROP CONSTRAINT IF EXISTS copy_trade_signals_min_copy_amount_check;

ALTER TABLE public.copy_trade_signals
  ADD CONSTRAINT copy_trade_signals_min_copy_amount_check
  CHECK (min_copy_amount >= 1);
