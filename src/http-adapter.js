/** Create an SDK delivery adapter for EngageKit's HTTP ingestion endpoint. */
export function createHttpAdapter({ apiUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!apiUrl || !apiKey) throw new Error('createHttpAdapter requires apiUrl and apiKey');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  return {
    async send(events) {
      const payload = events.map(e => ({ id: e.id, name: e.name, userId: e.userId || e.anonymousId, properties: { ...e.properties, ...(e.userTraits ? { traits: e.userTraits } : {}) }, timestamp: e.timestamp }));
      const response = await fetchImpl(apiUrl.replace(/\/$/, '') + '/v1/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engagekit-key': apiKey }, body: JSON.stringify({ events: payload }) });
      if (!response.ok) throw new Error('EngageKit delivery failed (' + response.status + '): ' + await response.text());
      return response.json();
    }
  };
}
