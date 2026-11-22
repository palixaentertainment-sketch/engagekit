import { app } from '../server/index.js';

// Vercel routes /api/* here. Strip the deployment prefix so Express
// receives the same /health and /v1/* paths used by local development.
export default function handler(req, res) {
  if (req.url === '/api') req.url = '/';
  else if (req.url?.startsWith('/api/')) req.url = req.url.slice(4);
  return app(req, res);
}
