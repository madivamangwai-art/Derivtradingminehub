ALTER TABLE public.copy_trade_signals
  ALTER COLUMN profit_rate SET DEFAULT 0.1500;

ALTER TABLE public.copy_trades
  ALTER COLUMN profit_rate SET DEFAULT 0.1500;

ALTER TABLE public.withdrawals
  ALTER COLUMN fee_rate SET DEFAULT 0.3200;

UPDATE public.copy_trade_signals
SET profit_rate = 0.1500
WHERE active = true;

UPDATE public.copy_trades
SET profit_rate = 0.1500
WHERE status = 'open';
