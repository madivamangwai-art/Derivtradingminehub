ALTER TABLE public.copy_trades
  ADD COLUMN IF NOT EXISTS result_override TEXT,
  ADD COLUMN IF NOT EXISTS result_overridden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_overridden_at TIMESTAMPTZ;

ALTER TABLE public.copy_trades
  DROP CONSTRAINT IF EXISTS copy_trades_result_override_check;

ALTER TABLE public.copy_trades
  ADD CONSTRAINT copy_trades_result_override_check
  CHECK (result_override IS NULL OR result_override IN ('win', 'loss'));
