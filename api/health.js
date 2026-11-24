import { app } from '../server/index.js';

export default function handler(req, res) {
  req.url = '/health' + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  return app(req, res);
}
