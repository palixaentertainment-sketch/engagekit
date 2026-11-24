import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPushBatch } from '../server/push-delivery.js';

test('delivers with bounded concurrency and records successes', async () => {
  const subscribers = Array.from({ length: 12 }, (_, id) => ({ id: String(id) }));
  let active = 0, peak = 0, recorded = 0;
  const result = await deliverPushBatch({
    subscribers, concurrency: 3,
    deliver: async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--; },
    recordResult: async (_subscriber, status) => { assert.equal(status.status, 'sent'); recorded++; },
    removeSubscriber: async () => assert.fail('Unexpected removal')
  });
  assert.equal(peak, 3);
  assert.equal(recorded, 12);
  assert.deepEqual(result, { total: 12, sent: 12, failed: 0, expired: 0 });
});

test('records failures and removes expired subscriptions', async () => {
  const subscribers = [{ id: 'gone' }, { id: 'bad' }, { id: 'ok' }];
  const results = [], removed = [];
  const result = await deliverPushBatch({
    subscribers,
    deliver: async s => {
      if (s.id === 'gone') throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (s.id === 'bad') throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    },
    recordResult: async (s, status) => results.push([s.id, status.status]),
    removeSubscriber: async s => removed.push(s.id)
  });
  assert.deepEqual(result, { total: 3, sent: 1, failed: 1, expired: 1 });
  assert.deepEqual(removed, ['gone']);
  assert.deepEqual(results.sort(), [['bad', 'failed'], ['gone', 'expired'], ['ok', 'sent']]);
});

test('rejects missing persistence callbacks', async () => {
  await assert.rejects(() => deliverPushBatch({ subscribers: [] }), /callbacks are required/);
});
