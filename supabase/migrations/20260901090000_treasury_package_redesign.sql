ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS payout_mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (payout_mode IN ('locked', 'daily')),
  ADD COLUMN IF NOT EXISTS maturity_return_rate NUMERIC(8,4) NOT NULL DEFAULT 1.0000;

CREATE TABLE IF NOT EXISTS public.treasury_settings (
  id INT PRIMARY KEY DEFAULT 1,
  withdrawals_frozen BOOLEAN NOT NULL DEFAULT false,
  payouts_frozen BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT treasury_settings_single_row CHECK (id = 1)
);

GRANT SELECT ON public.treasury_settings TO authenticated;
GRANT ALL ON public.treasury_settings TO service_role;
ALTER TABLE public.treasury_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treasury_settings_admin_read" ON public.treasury_settings;
CREATE POLICY "treasury_settings_admin_read" ON public.treasury_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "treasury_settings_admin_update" ON public.treasury_settings;
CREATE POLICY "treasury_settings_admin_update" ON public.treasury_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.treasury_settings (id, withdrawals_frozen, payouts_frozen)
VALUES (1, false, false)
ON CONFLICT (id) DO NOTHING;

UPDATE public.packages
SET active = false
WHERE code IN ('B1','B2','S1','G1','D6','D7','D8');

INSERT INTO public.packages
  (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order, active, payout_mode, maturity_return_rate)
VALUES
  ('L1','Sky Vault 45','gold',10000,0,45,500,10,true,'locked',1.3500),
  ('D1','Apex Daily 60','diamond',10000,120,60,500,20,true,'daily',1.0000),
  ('D2','Crown Daily 60','platinum',25000,375,60,1000,30,true,'daily',1.0000)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  price = EXCLUDED.price,
  daily_payout = EXCLUDED.daily_payout,
  duration_days = EXCLUDED.duration_days,
  referral_bonus = EXCLUDED.referral_bonus,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  payout_mode = EXCLUDED.payout_mode,
  maturity_return_rate = EXCLUDED.maturity_return_rate;
