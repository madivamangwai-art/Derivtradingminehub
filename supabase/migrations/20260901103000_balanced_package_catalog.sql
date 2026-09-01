UPDATE public.packages
SET active = false
WHERE code NOT IN ('L1', 'L2', 'L3', 'D1', 'D2', 'D3');

INSERT INTO public.packages
  (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order, active, payout_mode, maturity_return_rate)
VALUES
  ('L1','Starter Vault 45','silver',5000,0,45,250,10,true,'locked',1.2500),
  ('L2','Skyline Vault 45','gold',10000,0,45,500,20,true,'locked',1.3000),
  ('L3','Executive Vault 45','platinum',25000,0,45,1250,30,true,'locked',1.3500),
  ('D1','Pulse Daily 60','silver',5000,60,60,250,40,true,'daily',1.0000),
  ('D2','Apex Daily 60','gold',10000,130,60,500,50,true,'daily',1.0000),
  ('D3','Crown Daily 60','platinum',25000,350,60,1250,60,true,'daily',1.0000)
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
