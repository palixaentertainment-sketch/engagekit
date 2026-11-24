import { app } from '../../server/index.js';

export default function handler(req, res) {
  const originalUrl = req.url || '/';
  const queryIndex = originalUrl.indexOf('?');
  let pathname = queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : originalUrl.slice(queryIndex);

  // Vercel may expose either the incoming URL or the internal /api route.
  // Strip the filesystem-function prefix before handing the request to Express.
  if (pathname === '/api') pathname = '/';
  else if (pathname.startsWith('/api/')) pathname = pathname.slice(4);

  // Express mounts account routes at /v1, so preserve that prefix exactly once.
  const route = pathname === '/v1' || pathname.startsWith('/v1/')
    ? pathname
    : '/v1' + (pathname.startsWith('/') ? pathname : '/' + pathname);

  req.url = route + query;
  return app(req, res);
}
