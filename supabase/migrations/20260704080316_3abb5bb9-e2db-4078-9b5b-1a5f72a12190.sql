ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS net_amount numeric(14,2);
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS conversation_id text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS originator_conversation_id text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS provider_reference text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS metadata jsonb;