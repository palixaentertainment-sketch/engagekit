import { app } from '../../server/index.js';

// Vercel rewrites public /v1/* requests to /api/v1/*.
// Restore the Express mount path before handing the request to the app.
export default function handler(req, res) {
  const url = req.url || '/';
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : url.slice(queryIndex);
  const apiPrefix = '/api/v1';

  if (pathname === apiPrefix) req.url = '/v1/' + query;
  else if (pathname.startsWith(apiPrefix + '/')) {
    req.url = '/v1' + pathname.slice(apiPrefix.length) + query;
  }

  return app(req, res);
}
