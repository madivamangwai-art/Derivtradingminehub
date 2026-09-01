UPDATE public.packages
SET active = false
WHERE code NOT IN (
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10',
  'D30-1', 'D30-2', 'D30-3', 'D30-4', 'D30-5'
);

INSERT INTO public.packages
  (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order, active, payout_mode, maturity_return_rate)
VALUES
  ('L1','Lock Vault 60 Starter','silver',5000,0,60,250,10,true,'locked',1.4200),
  ('L2','Lock Vault 60 Rise','silver',10000,0,60,500,20,true,'locked',1.4500),
  ('L3','Lock Vault 60 Prime','gold',20000,0,60,1000,30,true,'locked',1.4800),
  ('L4','Lock Vault 60 Edge','gold',35000,0,60,1750,40,true,'locked',1.5100),
  ('L5','Lock Vault 60 Crown','diamond',50000,0,60,2500,50,true,'locked',1.5400),
  ('L6','Lock Vault 60 Apex','diamond',75000,0,60,3750,60,true,'locked',1.5700),
  ('L7','Lock Vault 60 Elite','platinum',100000,0,60,5000,70,true,'locked',1.5900),
  ('L8','Lock Vault 60 Executive','platinum',150000,0,60,7500,80,true,'locked',1.6100),
  ('L9','Lock Vault 60 Sovereign','platinum',250000,0,60,12500,90,true,'locked',1.6300),
  ('L10','Lock Vault 60 Legacy','platinum',400000,0,60,20000,100,true,'locked',1.6500),
  ('D1','Daily 45 Starter','silver',5000,28,45,250,110,true,'daily',1.0000),
  ('D2','Daily 45 Rise','silver',10000,67,45,500,120,true,'daily',1.0000),
  ('D3','Daily 45 Prime','gold',20000,156,45,1000,130,true,'daily',1.0000),
  ('D4','Daily 45 Edge','gold',35000,292,45,1750,140,true,'daily',1.0000),
  ('D5','Daily 45 Crown','diamond',50000,444,45,2500,150,true,'daily',1.0000),
  ('D6','Daily 45 Apex','diamond',75000,700,45,3750,160,true,'daily',1.0000),
  ('D7','Daily 45 Elite','platinum',100000,1000,45,5000,170,true,'daily',1.0000),
  ('D8','Daily 45 Executive','platinum',150000,1600,45,7500,180,true,'daily',1.0000),
  ('D9','Daily 45 Sovereign','platinum',250000,2667,45,12500,190,true,'daily',1.0000),
  ('D10','Daily 45 Legacy','platinum',400000,3556,45,20000,200,true,'daily',1.0000),
  ('D30-1','Daily 30 Prime Boost','gold',20000,200,30,1000,210,true,'daily',1.0000),
  ('D30-2','Daily 30 Crown Boost','diamond',50000,533,30,2500,220,true,'daily',1.0000),
  ('D30-3','Daily 30 Apex Boost','diamond',100000,1167,30,5000,230,true,'daily',1.0000),
  ('D30-4','Daily 30 Executive Boost','platinum',250000,3083,30,12500,240,true,'daily',1.0000),
  ('D30-5','Daily 30 Legacy Boost','platinum',400000,5333,30,20000,250,true,'daily',1.0000)
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
