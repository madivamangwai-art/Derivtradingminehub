
-- 1. Referral code generator now uses a name prefix (up to 4 letters) + 3 digits
CREATE OR REPLACE FUNCTION public.gen_referral_code(_name TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  code TEXT;
  attempts INT := 0;
BEGIN
  prefix := upper(regexp_replace(COALESCE(_name, ''), '[^A-Za-z]', '', 'g'));
  prefix := substr(prefix, 1, 4);
  IF length(prefix) < 3 THEN
    prefix := rpad(prefix, 3, 'X');
  END IF;

  LOOP
    code := prefix || lpad((floor(random() * 1000))::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
    attempts := attempts + 1;
    IF attempts > 30 THEN
      -- fall back to random 4-digit suffix
      code := prefix || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- 2. handle_new_user now derives the referral code from the display name/email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code TEXT;
  referrer_uuid UUID;
  display_name TEXT;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  ref_code := public.gen_referral_code(display_name);

  IF NEW.raw_user_meta_data ? 'referred_by_code' THEN
    SELECT id INTO referrer_uuid FROM public.profiles
      WHERE referral_code = upper(NEW.raw_user_meta_data->>'referred_by_code');
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(display_name, ''),
    NEW.raw_user_meta_data->>'phone',
    ref_code, referrer_uuid
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Create the missing trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill any existing auth users missing a profile/wallet
INSERT INTO public.profiles (id, email, full_name, referral_code)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  public.gen_referral_code(COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.wallets (user_id)
SELECT u.id FROM auth.users u
LEFT JOIN public.wallets w ON w.user_id = u.id
WHERE w.user_id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'client'::app_role FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'client'
WHERE r.user_id IS NULL;

