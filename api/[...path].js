import { app } from '../server/index.js';

// Vercel's single /api catch-all handles both health checks and versioned API
// requests. The rewrite maps public /v1/* to /api/*, so restore the Express
// mount prefix here. Keep /health unprefixed for the health endpoint.
export default function handler(req, res) {
  const url = req.url || '/';
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : url.slice(queryIndex);

  if (pathname === '/api') {
    req.url = '/' + query;
  } else if (pathname.startsWith('/api/')) {
    const route = pathname.slice(4);
    req.url = route === '/health' || route.startsWith('/health/')
      ? route + query
      : '/v1' + route + query;
  }

  return app(req, res);
}
