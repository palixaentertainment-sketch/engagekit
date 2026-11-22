import { app } from '../server/index.js';

export default function handler(req, res) {
  const originalUrl = req.url || '/';
  const queryIndex = originalUrl.indexOf('?');
  const pathname = queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : originalUrl.slice(queryIndex);

  // Vercel catch-all may expose either the rewritten /api path or the original
  // /v1 path depending on routing configuration. Normalize both forms.
  let route = pathname;
  if (route === '/api') route = '/';
  else if (route.startsWith('/api/')) route = route.slice(4);
  if (route !== '/health' && !route.startsWith('/health/')) {
    if (!route.startsWith('/v1/')) route = '/v1' + (route.startsWith('/') ? route : '/' + route);
  }

  req.url = route + query;
  const requestId = req.headers['x-vercel-id'] || req.headers['x-request-id'] || 'unknown';
  const started = Date.now();
  res.on('finish', () => {
    console.log('[vercel-request]', {
      requestId, method: req.method, path: route,
      status: res.statusCode, durationMs: Date.now() - started
    });
  });
  return app(req, res);
}
