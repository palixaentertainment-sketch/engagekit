import express from 'express';
import crypto from 'node:crypto';

export function createAccountRouter(pool) {
  const router = express.Router();
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;

  async function authRequest(path, body) {
    if (!supabaseUrl || !anonKey) throw new Error('Supabase Auth is not configured');
    const response = await fetch(supabaseUrl + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: anonKey },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.msg || data.message || data.error_description || 'Authentication failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function requireUser(req, res, next) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || match[1].length > 8192) return res.status(401).json({ error: 'Sign in required' });
    try {
      const response = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { apikey: anonKey, authorization: 'Bearer ' + match[1] }
      });
      if (!response.ok) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      req.user = await response.json();
      if (!req.user?.id) return res.status(401).json({ error: 'Invalid session' });
      next();
    } catch {
      res.status(503).json({ error: 'Authentication service unavailable' });
    }
  }

  async function ownedProject(req, res, next) {
    try {
      const result = await pool.query(
        'SELECT id,name,slug,website_url,created_at FROM projects WHERE id=$1 AND owner_id=$2',
        [req.params.projectId, req.user.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
      req.project = result.rows[0];
      next();
    } catch { res.status(500).json({ error: 'Project lookup failed' }); }
  }

  router.post('/auth/signup', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length < 8 || password.length > 128)
      return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
    try {
      const data = await authRequest('signup', { email: email.trim(), password });
      res.status(201).json(data);
    } catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });

  router.post('/auth/signin', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string')
      return res.status(400).json({ error: 'Email and password are required.' });
    try {
      const data = await authRequest('token?grant_type=password', { email: email.trim(), password });
      res.json(data);
    } catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });

  router.get('/account/me', requireUser, (req, res) => {
    res.json({ user: { id: req.user.id, email: req.user.email } });
  });

  router.get('/account/projects', requireUser, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id,name,slug,website_url,created_at FROM projects WHERE owner_id=$1 ORDER BY created_at DESC',
        [req.user.id]
      );
      res.json({ projects: result.rows });
    } catch { res.status(500).json({ error: 'Could not load projects. Apply the account migration first.' }); }
  });

  router.post('/account/projects', requireUser, async (req, res) => {
    const { name, slug, websiteUrl } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
      return res.status(400).json({ error: 'Project name must be 2–100 characters.' });
    if (typeof slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug))
      return res.status(400).json({ error: 'Use a lowercase slug with letters, numbers and hyphens.' });
    let website = null;
    if (websiteUrl) {
      try {
        const parsed = new URL(websiteUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
        website = parsed.toString();
      } catch { return res.status(400).json({ error: 'Enter a valid website URL.' }); }
    }
    const publicKey = 'ek_pub_' + crypto.randomBytes(32).toString('base64url');
    const secretKey = 'ek_sec_' + crypto.randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const project = await client.query(
        'INSERT INTO projects(owner_id,name,slug,website_url) VALUES($1,$2,$3,$4) RETURNING id,name,slug,website_url,created_at',
        [req.user.id, name.trim(), slug, website]
      );
      await client.query(
        'INSERT INTO api_keys(project_id,name,key_prefix,key_hash,key_type) VALUES($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)',
        [project.rows[0].id, 'Public browser key', publicKey.slice(0,16), crypto.createHash('sha256').update(publicKey).digest('hex'), 'public',
          'Default secret key', secretKey.slice(0,16), crypto.createHash('sha256').update(secretKey).digest('hex'), 'secret']
      );
      await client.query('COMMIT');
      res.status(201).json({ project: project.rows[0], publicKey, secretKey,
        warning: 'Copy the secret key now. It is shown only once.' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'That project slug is already in use.' });
      res.status(500).json({ error: 'Project creation failed.' });
    } finally { client.release(); }
  });

  router.get('/account/projects/:projectId/overview', requireUser, ownedProject, async (req, res) => {
    try {
      const [subscribers, events, campaigns] = await Promise.all([
        pool.query('SELECT COUNT(*)::int n FROM push_subscribers WHERE project_id=$1', [req.project.id]),
        pool.query('SELECT COUNT(*)::int n FROM events WHERE project_id=$1', [req.project.id]),
        pool.query('SELECT COUNT(*)::int n FROM campaigns WHERE project_id=$1', [req.project.id])
      ]);
      res.json({ subscribers: subscribers.rows[0].n, events: events.rows[0].n, campaigns: campaigns.rows[0].n });
    } catch { res.status(500).json({ error: 'Could not load project overview.' }); }
  });

  router.get('/account/projects/:projectId/subscribers', requireUser, ownedProject, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id,created_at,updated_at FROM push_subscribers WHERE project_id=$1 ORDER BY created_at DESC LIMIT 500',
        [req.project.id]);
      res.json({ subscribers: result.rows });
    } catch { res.status(500).json({ error: 'Could not load subscribers.' }); }
  });

  router.get('/account/projects/:projectId/events', requireUser, ownedProject, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id,name,user_id,properties,timestamp FROM events WHERE project_id=$1 ORDER BY timestamp DESC LIMIT 200',
        [req.project.id]);
      res.json({ events: result.rows });
    } catch { res.status(500).json({ error: 'Could not load events.' }); }
  });

  router.get('/account/projects/:projectId/campaigns', requireUser, ownedProject, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id,title,body,destination_path,status,created_at,sent_at FROM campaigns WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',
        [req.project.id]);
      res.json({ campaigns: result.rows });
    } catch { res.status(500).json({ error: 'Could not load campaigns.' }); }
  });

  router.post('/account/projects/:projectId/push/send', requireUser, ownedProject, async (req, res) => {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return res.status(503).json({ error: 'Push delivery is not configured yet.' });
    const { title, body, url = '/' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
        typeof body !== 'string' || !body.trim() || body.length > 2000)
      return res.status(400).json({ error: 'Add a title and message (maximum 120 and 2,000 characters).' });
    if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.includes('\\'))
      return res.status(400).json({ error: 'Destination must be a safe relative path.' });
    try {
      const webpush = (await import('web-push')).default;
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@engagekit.app', pub, priv);
      const created = await pool.query(
        "INSERT INTO campaigns(project_id,title,body,destination_path,status) VALUES($1,$2,$3,$4,'sending') RETURNING id",
        [req.project.id, title.trim(), body.trim(), url]);
      const subscribers = await pool.query('SELECT id,subscription FROM push_subscribers WHERE project_id=$1', [req.project.id]);
      let sent=0, failed=0;
      for (const item of subscribers.rows) {
        try {
          await webpush.sendNotification(item.subscription, JSON.stringify({title:title.trim(),body:body.trim(),url}), {TTL:3600});
          sent++;
          await pool.query("INSERT INTO campaign_results(campaign_id,subscriber_id,status) VALUES($1,$2,'sent')",[created.rows[0].id,item.id]);
        } catch (error) {
          failed++;
          const expired=[404,410].includes(error.statusCode);
          await pool.query('INSERT INTO campaign_results(campaign_id,subscriber_id,status,response_code,error_message) VALUES($1,$2,$3,$4,$5)',
            [created.rows[0].id,item.id,expired?'expired':'failed',error.statusCode||null,String(error.message||'Delivery failed').slice(0,500)]);
          if(expired) await pool.query('DELETE FROM push_subscribers WHERE project_id=$1 AND id=$2',[req.project.id,item.id]);
        }
      }
      await pool.query("UPDATE campaigns SET status='sent',sent_at=NOW() WHERE id=$1",[created.rows[0].id]);
      res.json({campaignId:created.rows[0].id,total:subscribers.rowCount,sent,failed});
    } catch { res.status(500).json({error:'Campaign could not be sent.'}); }
  });

  return router;
}
