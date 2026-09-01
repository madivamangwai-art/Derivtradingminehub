ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'direct_income';

ALTER TABLE public.referral_earnings
  ALTER COLUMN package_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_trade_id UUID REFERENCES public.copy_trades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'package_bonus';

UPDATE public.referral_earnings
SET source = 'package_bonus'
WHERE source IS NULL;

ALTER TABLE public.referral_earnings
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'trade_profit';

CREATE TABLE IF NOT EXISTS public.copy_trade_analysts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Portfolio Manager',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  one_day_return_rate NUMERIC(8,4) NOT NULL DEFAULT 0.02,
  seven_day_roi NUMERIC(8,4) NOT NULL DEFAULT 0.14,
  follow_period_days INTEGER,
  commission_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  min_copy_amount NUMERIC(14,2) NOT NULL DEFAULT 1,
  max_copy_amount NUMERIC(14,2),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_trade_analysts_active_sort
  ON public.copy_trade_analysts(active, sort_order, created_at);

ALTER TABLE public.copy_trade_analysts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copy_trade_analysts_read" ON public.copy_trade_analysts;
CREATE POLICY "copy_trade_analysts_read" ON public.copy_trade_analysts
  FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "copy_trade_analysts_admin_all" ON public.copy_trade_analysts;
CREATE POLICY "copy_trade_analysts_admin_all" ON public.copy_trade_analysts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.copy_trade_analysts TO authenticated;
GRANT ALL ON public.copy_trade_analysts TO service_role;

INSERT INTO public.copy_trade_analysts (
  name,
  title,
  bio,
  one_day_return_rate,
  seven_day_roi,
  follow_period_days,
  commission_rate,
  min_copy_amount,
  sort_order
)
VALUES
  (
    'Carl Grindan',
    'Portfolio Manager',
    'Carl focuses on momentum entries, strict position sizing, and short copy-trade cycles across technology leaders.',
    0.04,
    0.35,
    NULL,
    0,
    1,
    1
  ),
  (
    'Professor Jarvis',
    'Portfolio Manager',
    'Professor Jarvis tracks macro risk, liquidity shifts, and large-cap trend reversals before confirming a signal.',
    0.02,
    0.16,
    NULL,
    0,
    1,
    2
  ),
  (
    'Tom',
    'Portfolio Manager',
    'Professor Tom holds a Ph.D. in Finance and researches market liquidity, options, credit risk, and fixed income pricing.',
    0.02,
    0.14,
    NULL,
    0,
    1,
    3
  )
ON CONFLICT DO NOTHING;
