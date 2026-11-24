/**
 * Deliver a push campaign with bounded concurrency and per-subscriber results.
 * Invalid subscriptions (404/410) are removed so they are not retried forever.
 */
export async function deliverPushBatch({ subscribers, deliver, recordResult, removeSubscriber, concurrency = 10 }) {
  if (!Array.isArray(subscribers)) throw new TypeError('subscribers must be an array');
  if (typeof deliver !== 'function' || typeof recordResult !== 'function' || typeof removeSubscriber !== 'function')
    throw new TypeError('delivery and persistence callbacks are required');
  const limit = Math.max(1, Math.min(25, Math.floor(Number(concurrency) || 1)));
  let cursor = 0;
  const totals = { total: subscribers.length, sent: 0, failed: 0, expired: 0 };
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= subscribers.length) return;
      const subscriber = subscribers[index];
      try {
        await deliver(subscriber);
        await recordResult(subscriber, { status: 'sent' });
        totals.sent++;
      } catch (error) {
        const responseCode = Number(error?.statusCode) || null;
        const expired = responseCode === 404 || responseCode === 410;
        await recordResult(subscriber, {
          status: expired ? 'expired' : 'failed',
          responseCode,
          errorMessage: String(error?.message || 'Delivery failed').slice(0, 500)
        });
        if (expired) {
          await removeSubscriber(subscriber);
          totals.expired++;
        } else totals.failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, subscribers.length) }, () => worker()));
  return totals;
}
