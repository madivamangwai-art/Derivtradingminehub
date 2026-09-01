ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'spin_ticket';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'spin_win';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'red_packet_create';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'admin_adjust';