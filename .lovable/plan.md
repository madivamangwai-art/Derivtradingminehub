
# MiningApp — Build Plan

Currency: KES. Auth: Email/password + Google. Backend: Lovable Cloud.

## 1. Database schema

- **profiles** — `id (uuid = auth.users)`, `full_name`, `phone`, `referral_code (unique)`, `referred_by (uuid, nullable)`, `created_at`. Trigger auto-creates on signup.
- **user_roles** — `id`, `user_id`, `role (enum: admin, client)`. Uses `has_role()` security-definer function.
- **wallets** — `user_id (pk)`, `balance`, `total_earned`, `total_deposited`, `total_withdrawn`.
- **packages** — `id`, `name`, `tier (bronze/silver/gold/diamond/...)`, `price`, `daily_payout`, `duration_days`, `referral_bonus`, `active`.
- **user_packages** — `id`, `user_id`, `package_id`, `purchased_at`, `expires_at`, `last_payout_at`, `total_paid_out`, `status`.
- **deposits** — `id`, `user_id`, `amount`, `mpesa_receipt`, `checkout_request_id`, `status (pending/success/failed)`, `created_at`.
- **withdrawals** — `id`, `user_id`, `amount`, `mpesa_phone`, `status (pending/approved/rejected/paid)`, `admin_note`, `created_at`.
- **referral_earnings** — `id`, `referrer_id`, `referred_user_id`, `package_id`, `amount`, `created_at`.
- **support_settings** — singleton row: `whatsapp_url`, `telegram_url`.
- **support_messages** — `id`, `user_id`, `sender (user/admin)`, `message`, `read`, `created_at`.
- **transactions** — unified ledger for wallet activity (deposit/withdraw/payout/referral).

All tables get proper GRANTs + RLS (users see own, admins see all via `has_role`).

## 2. Seeded packages

| Tier | Price | Daily | Days | Total | Ref Bonus |
|---|---|---|---|---|---|
| D1 Bronze | 1,000 | 70 | 30 | 2,100 | 50 |
| D2 Silver | 3,000 | 220 | 30 | 6,600 | 150 |
| D3 Gold | 8,000 | 620 | 30 | 18,600 | 400 |
| D4 Diamond | 20,000 | 1,600 | 30 | 48,000 | 1,000 |
| D5 Platinum | 50,000 | 4,200 | 30 | 126,000 | 2,500 |

## 3. Referral logic

- On signup, if `?ref=CODE` in URL, set `referred_by`.
- On successful package purchase, credit `referrer` with that package's `referral_bonus` (once per referred user per tier upgrade — higher tier = higher bonus, only paid on upgrade to a tier not yet purchased).

## 4. M-Pesa Daraja (STK Push)

Server function `initiateStkPush(amount, phone)`:
- Uses secrets: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_ENV` (sandbox/production).
- OAuth → STK Push → store `checkout_request_id` in `deposits` (pending).

Public webhook `POST /api/public/mpesa/callback`:
- On success → mark deposit success, credit wallet, run referral payout if this was a package purchase context.

Withdrawals: manual approval by admin (B2C payout is out-of-scope MVP unless requested).

## 5. Payout cron

Server route `/api/public/cron/payouts` (protected by `CRON_SECRET` header):
- Iterates active `user_packages`, credits daily_payout if 24h since `last_payout_at`, marks expired.

## 6. Client app (`/_authenticated/*`)

Bottom-tab layout (mobile-first): **Home | Wallet | Trade | Team | My**.

- **Home** — balance card, active packages, today's earnings, quick actions, recent transactions.
- **Wallet** — Deposit (STK Push form), Withdraw (form), transaction history.
- **Trade** — tabs: **Mine** (package cards to purchase), **Aviator** (placeholder game UI), **Spin** (daily spin wheel placeholder).
- **Team** — referral link + QR, direct/indirect stats, referral earnings list, list of referred users with their purchase status.
- **My** — profile, edit details, support chat, WhatsApp/Telegram join buttons, sign out.

## 7. Admin panel (`/_authenticated/admin/*`)

Sidebar layout, gated by `admin` role.

- **Clients** — table, expandable rows showing wallet + purchased packages.
- **Deposits** — filter by status, manual approve/reject fallback.
- **Withdrawals** — approve/reject, mark paid, add note.
- **Teams** — tree visualization (react-d3-tree) of referral chains.
- **Support** — edit WhatsApp/Telegram URLs; chat replies inbox.
- **Packages** — CRUD on packages (bonus).

## 8. Design direction

Dark fintech feel: deep navy `#0B1220` background, gold `#F5B301` primary (mining vibe), emerald for gains, red for losses. Sora headings + Inter body. Rounded 2xl cards, subtle gradients, no purple.

## 9. Route map

```text
/                       marketing landing + login CTA
/auth                   sign in/up (email + Google), reads ?ref=
/reset-password
/_authenticated/
  home | wallet | trade | trade/mine | trade/aviator | trade/spin
  team | my | my/support
/_authenticated/admin/
  clients | deposits | withdrawals | teams | support | packages
/api/public/mpesa/callback
/api/public/cron/payouts
```

## 10. Delivery order

1. Enable Cloud, migrations + seed packages, roles + first admin bootstrap.
2. Design system in `styles.css`, layout shells (client bottom-tabs, admin sidebar).
3. Auth pages with referral capture + Google.
4. Client screens (Home, Wallet, Trade/Mine, Team, My) wired to server fns.
5. Admin screens.
6. M-Pesa STK Push + webhook (requires you to add Daraja secrets).
7. Payout cron.
8. Support chat + settings, Telegram/WhatsApp links.

## Secrets you'll need to provide after Cloud is enabled

`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_ENV` (`sandbox` or `production`), `MPESA_CALLBACK_URL` (I'll compute), `CRON_SECRET` (auto-generated).

Approve and I'll start building step by step.
