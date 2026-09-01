UPDATE public.copy_trade_analysts
SET min_copy_amount = 1
WHERE min_copy_amount IS NULL OR min_copy_amount < 1;

UPDATE public.copy_trade_analysts
SET max_copy_amount = NULL
WHERE max_copy_amount IS NOT NULL AND max_copy_amount < min_copy_amount;

ALTER TABLE public.copy_trade_analysts
  ALTER COLUMN min_copy_amount SET DEFAULT 1,
  ALTER COLUMN min_copy_amount SET NOT NULL;

ALTER TABLE public.copy_trade_analysts
  DROP CONSTRAINT IF EXISTS copy_trade_analysts_min_copy_amount_check;

ALTER TABLE public.copy_trade_analysts
  ADD CONSTRAINT copy_trade_analysts_min_copy_amount_check
  CHECK (min_copy_amount >= 1);

ALTER TABLE public.copy_trade_analysts
  DROP CONSTRAINT IF EXISTS copy_trade_analysts_max_copy_amount_check;

ALTER TABLE public.copy_trade_analysts
  ADD CONSTRAINT copy_trade_analysts_max_copy_amount_check
  CHECK (max_copy_amount IS NULL OR max_copy_amount >= min_copy_amount);
