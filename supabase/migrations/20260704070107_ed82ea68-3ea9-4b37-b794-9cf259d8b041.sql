
-- 1. Additional packages (higher tiers)
INSERT INTO public.packages (code, name, tier, price, daily_payout, duration_days, referral_bonus, sort_order, active)
VALUES
  ('D6','D6 Titanium','platinum',25000, 1875, 30, 1000, 60, true),
  ('D7','D7 Obsidian','platinum',75000, 5800, 30, 3000, 70, true),
  ('D8','D8 Legendary','platinum',250000, 20000, 30, 10000, 80, true)
ON CONFLICT (code) DO NOTHING;

-- 2. Red packets
CREATE TABLE IF NOT EXISTS public.red_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  total_amount NUMERIC NOT NULL,
  max_claims INT NOT NULL,
  ticket_value INT NOT NULL,
  claimed_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.red_packets TO authenticated;
GRANT ALL ON public.red_packets TO service_role;
ALTER TABLE public.red_packets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creators see own packets" ON public.red_packets FOR SELECT TO authenticated
  USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "creators insert" ON public.red_packets FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.red_packet_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id UUID NOT NULL REFERENCES public.red_packets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tickets_awarded INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (packet_id, user_id)
);
GRANT SELECT, INSERT ON public.red_packet_claims TO authenticated;
GRANT ALL ON public.red_packet_claims TO service_role;
ALTER TABLE public.red_packet_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own claims" ON public.red_packet_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Spin tickets
CREATE TABLE IF NOT EXISTS public.spin_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value_kes INT NOT NULL,
  source TEXT NOT NULL DEFAULT 'purchase',
  used_at TIMESTAMPTZ,
  prize_amount NUMERIC,
  prize_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.spin_tickets TO authenticated;
GRANT ALL ON public.spin_tickets TO service_role;
ALTER TABLE public.spin_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own tickets" ON public.spin_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS spin_tickets_user_idx ON public.spin_tickets(user_id, used_at);
