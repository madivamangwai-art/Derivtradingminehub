import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalletActivityItems } from '../src/lib/payment-state.mjs';

test('buildWalletActivityItems surfaces pending deposits and withdrawals first', () => {
  const items = buildWalletActivityItems(
    [{ id: 'd1', created_at: '2024-01-02T00:00:00.000Z', amount: 1000, status: 'pending', mpesa_phone: '254700000000' }],
    [{ id: 'w1', created_at: '2024-01-03T00:00:00.000Z', amount: 500, status: 'pending', mpesa_phone: '254700000000' }],
    [{ id: 't1', created_at: '2024-01-01T00:00:00.000Z', kind: 'bonus', amount: 25, description: 'Referral bonus' }],
  );

  assert.equal(items[0].kind, 'withdrawal');
  assert.equal(items[0].status, 'pending');
  assert.equal(items[1].kind, 'deposit');
  assert.equal(items[1].status, 'pending');
  assert.equal(items[2].kind, 'bonus');
});
