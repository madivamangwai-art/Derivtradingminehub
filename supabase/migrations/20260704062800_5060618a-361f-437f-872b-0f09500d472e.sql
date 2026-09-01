
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.package_tier AS ENUM ('bronze','silver','gold','diamond','platinum');
CREATE TYPE public.txn_status AS ENUM ('pending','success','failed','approved','rejected','paid');
CREATE TYPE public.txn_kind AS ENUM ('deposit','withdrawal','payout','referral','purchase','adjustment');
CREATE TYPE public.pkg_status AS ENUM ('active','completed','cancelled');

-- Utility
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Wallets
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deposited NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tier public.package_tier NOT NULL,
  price NUMERIC(14,2) NOT NULL,
  daily_payout NUMERIC(14,2) NOT NULL,
  duration_days INT NOT NULL,
  referral_bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.packages TO authenticated, anon;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- User packages
CREATE TABLE public.user_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_payout_at TIMESTAMPTZ,
  total_paid_out NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.pkg_status NOT NULL DEFAULT 'active'
);
GRANT SELECT ON public.user_packages TO authenticated;
GRANT ALL ON public.user_packages TO service_role;
ALTER TABLE public.user_packages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_packages_user ON public.user_packages(user_id);

-- Deposits
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  mpesa_phone TEXT,
  mpesa_receipt TEXT,
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  status public.txn_status NOT NULL DEFAULT 'pending',
  purpose TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deposits_user ON public.deposits(user_id);

-- Withdrawals
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  mpesa_phone TEXT NOT NULL,
  status public.txn_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_withdrawals_user ON public.withdrawals(user_id);

-- Referral earnings
CREATE TABLE public.referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  user_package_id UUID REFERENCES public.user_packages(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, referred_user_id, package_id)
);
GRANT SELECT ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

-- Transactions ledger
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.txn_kind NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transactions_user ON public.transactions(user_id, created_at DESC);

-- Support settings (singleton)
CREATE TABLE public.support_settings (
  id INT PRIMARY KEY DEFAULT 1,
  whatsapp_url TEXT,
  telegram_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT ON public.support_settings TO authenticated, anon;
GRANT ALL ON public.support_settings TO service_role;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.support_settings (id, whatsapp_url, telegram_url) VALUES (1, '', '');

-- Support messages
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user','admin')),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_support_messages_user ON public.support_messages(user_id, created_at);

-- =================== POLICIES ===================
-- Profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- User roles
CREATE POLICY "roles_self_view" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Wallets
CREATE POLICY "wallets_self_view" ON public.wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Packages
CREATE POLICY "packages_active_read" ON public.packages FOR SELECT TO authenticated, anon
  USING (active = true OR public.has_role(auth.uid(),'admin'));

-- User packages
CREATE POLICY "user_packages_self_view" ON public.user_packages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Deposits
CREATE POLICY "deposits_self_view" ON public.deposits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "deposits_self_insert" ON public.deposits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Withdrawals
CREATE POLICY "withdrawals_self_view" ON public.withdrawals FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "withdrawals_self_insert" ON public.withdrawals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Referral earnings
CREATE POLICY "ref_earnings_self_view" ON public.referral_earnings FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR public.has_role(auth.uid(),'admin'));

-- Transactions
CREATE POLICY "txns_self_view" ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Support settings
CREATE POLICY "support_settings_read_all" ON public.support_settings FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "support_settings_admin_update" ON public.support_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Support messages
CREATE POLICY "support_msgs_self_view" ON public.support_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "support_msgs_self_insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND sender = 'user');

-- =================== SIGNUP TRIGGER ===================
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE code TEXT; BEGIN
  LOOP
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref_code TEXT;
  referrer_uuid UUID;
BEGIN
  ref_code := public.gen_referral_code();

  IF NEW.raw_user_meta_data ? 'referred_by_code' THEN
    SELECT id INTO referrer_uuid FROM public.profiles
      WHERE referral_code = upper(NEW.raw_user_meta_data->>'referred_by_code');
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    ref_code,
    referrer_uuid
  );

  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================== SEED PACKAGES ===================
INSERT INTO public.packages (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order) VALUES
('D1','D1 Bronze','bronze',1000,70,30,50,1),
('D2','D2 Silver','silver',3000,220,30,150,2),
('D3','D3 Gold','gold',8000,620,30,400,3),
('D4','D4 Diamond','diamond',20000,1600,30,1000,4),
('D5','D5 Platinum','platinum',50000,4200,30,2500,5);
-- add additional package tiers
INSERT INTO public.packages (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order) VALUES
('D6','D6 Starter','bronze',2000,140,30,75,6),
('D7','D7 Titan','platinum',250000,21000,30,12500,7);
