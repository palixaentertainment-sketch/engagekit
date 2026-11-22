import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import webpush from 'web-push';
import crypto from 'node:crypto';
import { createAccountRouter } from './account-routes.js';

const app = express();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
const port = Number(process.env.PORT || 4000);
const adminKey = process.env.ENGAGEKIT_ADMIN_KEY;
const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);

const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.length === 0 || origins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin blocked'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['content-type', 'x-engagekit-key', 'x-engagekit-admin-key', 'x-engagekit-setup-key']
}));
app.use(express.json({ limit: '256kb' }));
app.use('/v1', createAccountRouter(pool));

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function requireAdmin(req, res, next) {
  if (!adminKey) return res.status(503).json({ error: 'Admin key not configured' });
  if (!safeEqual(req.get('x-engagekit-admin-key'), adminKey)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
async function requireProject(req, res, next) {
  const raw = req.get('x-engagekit-key');
  if (!raw || raw.length > 256) return res.status(401).json({ error: 'Project API key required' });
  try {
    const result = await pool.query(
      'SELECT project_id,key_type FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL LIMIT 1',
      [sha256(raw)]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Invalid project API key' });
    req.projectId = result.rows[0].project_id;
    req.projectKeyType = result.rows[0].key_type;
    await pool.query('UPDATE api_keys SET last_used_at=NOW() WHERE key_hash=$1', [sha256(raw)]);
    next();
  } catch {
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}
function requireProjectAdmin(req, res, next) {
  requireAdmin(req, res, () => requireProject(req, res, () => {
    if (req.projectKeyType !== 'secret') return res.status(403).json({ error: 'Secret project key required' });
    next();
  }));
}
function validSubscription(s) {
  return s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') &&
    s.endpoint.length <= 4096 && s.keys &&
    typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}
function validPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}


const setupKey = process.env.ENGAGEKIT_SETUP_KEY;

app.post('/v1/projects', async (req, res) => {
  if (!setupKey) return res.status(503).json({ error: 'Project setup is not enabled' });
  if (!safeEqual(req.get('x-engagekit-setup-key'), setupKey))
    return res.status(401).json({ error: 'Unauthorized' });

  const { name, slug, websiteUrl, keyName = 'Default key' } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
    return res.status(400).json({ error: 'Project name must be 2-100 characters' });
  if (typeof slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug))
    return res.status(400).json({ error: 'Slug must be 1-50 lowercase letters, numbers or hyphens' });
  if (typeof keyName !== 'string' || !keyName.trim() || keyName.length > 80)
    return res.status(400).json({ error: 'Key name must be 1-80 characters' });

  let normalizedWebsite = null;
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error('Invalid URL');
      normalizedWebsite = parsed.toString();
    } catch {
      return res.status(400).json({ error: 'Website URL must be a valid HTTP or HTTPS URL' });
    }
  }

  const publicKey = 'ek_pub_' + crypto.randomBytes(32).toString('base64url');
  const secretKey = 'ek_sec_' + crypto.randomBytes(32).toString('base64url');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const project = await client.query(
      'INSERT INTO projects(name,slug,website_url) VALUES($1,$2,$3) RETURNING id,name,slug,website_url,created_at',
      [name.trim(), slug, normalizedWebsite]
    );
    await client.query(
      'INSERT INTO api_keys(project_id,name,key_prefix,key_hash,key_type) VALUES($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)',
      [project.rows[0].id, 'Public browser key', publicKey.slice(0, 16), sha256(publicKey), 'public', keyName.trim(), secretKey.slice(0, 16), sha256(secretKey), 'secret']
    );
    await client.query('COMMIT');
    res.status(201).json({ project: project.rows[0], publicKey, secretKey, warning: 'Store the secret key securely. The public key is designed for browser SDK use; both keys are shown only once.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'Project slug already exists' });
    res.status(500).json({ error: 'Project creation failed' });
  } finally {
    client.release();
  }
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    // Log only the PostgreSQL error code and a sanitized message. Never log
    // DATABASE_URL, connection options, or credentials.
    const message = String(error?.message || 'Unknown database error')
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[redacted connection string]');
    console.error('[health] database check failed', {
      code: error?.code || 'UNKNOWN',
      message
    });
    res.status(503).json({ ok: false });
  }
});
app.get('/v1/push/public-key', (_req, res) =>
  pub ? res.json({ publicKey: pub }) : res.status(503).json({ error: 'VAPID missing' })
);

app.post('/v1/push/subscribe', requireProject, async (req, res) => {
  const subscription = req.body?.subscription;
  if (!validSubscription(subscription)) return res.status(400).json({ error: 'Invalid subscription' });
  const id = typeof req.body.subscriberId === 'string' && req.body.subscriberId.length < 128
    ? req.body.subscriberId : crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO push_subscribers(id, project_id, endpoint, subscription)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(project_id, endpoint) DO UPDATE
       SET subscription=EXCLUDED.subscription, updated_at=NOW()`,
      [id, req.projectId, subscription.endpoint, subscription]
    );
    res.json({ ok: true, subscriberId: id });
  } catch { res.status(500).json({ error: 'Subscription save failed' }); }
});

app.post('/v1/push/unsubscribe', requireProject, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 4096)
    return res.status(400).json({ error: 'Valid endpoint required' });
  try {
    await pool.query('DELETE FROM push_subscribers WHERE project_id=$1 AND endpoint=$2', [req.projectId, endpoint]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Unsubscribe failed' }); }
});

app.post('/v1/events', requireProject, async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || !events.length || events.length > 100)
    return res.status(400).json({ error: 'Provide 1-100 events' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let accepted = 0;
    for (const event of events) {
      if (!event || typeof event.id !== 'string' || event.id.length > 128 ||
          typeof event.name !== 'string' || !event.name.trim() || event.name.length > 200) continue;
      const properties = event.properties && typeof event.properties === 'object' && !Array.isArray(event.properties)
        ? event.properties : {};
      await client.query(
        `INSERT INTO events(id, project_id, name, user_id, properties, timestamp)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,id) DO NOTHING`,
        [event.id, req.projectId, event.name.trim(), event.userId ? String(event.userId).slice(0, 200) : null,
          properties, event.timestamp ? new Date(event.timestamp) : new Date()]
      );
      accepted++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, accepted });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Ingest failed' });
  } finally { client.release(); }
});

app.get('/v1/admin/overview', requireProjectAdmin, async (req, res) => {
  try {
    const [subscribers, events, campaigns] = await Promise.all([
      pool.query('SELECT COUNT(*)::int n FROM push_subscribers WHERE project_id=$1', [req.projectId]),
      pool.query('SELECT COUNT(*)::int n FROM events WHERE project_id=$1', [req.projectId]),
      pool.query('SELECT COUNT(*)::int n FROM campaigns WHERE project_id=$1', [req.projectId])
    ]);
    res.json({ subscribers: subscribers.rows[0].n, events: events.rows[0].n, campaigns: campaigns.rows[0].n });
  } catch { res.status(500).json({ error: 'Overview query failed' }); }
});
app.get('/v1/admin/subscribers', requireProjectAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id,created_at,updated_at FROM push_subscribers WHERE project_id=$1 ORDER BY created_at DESC LIMIT 500',
      [req.projectId]
    );
    res.json({ subscribers: result.rows });
  } catch { res.status(500).json({ error: 'Subscriber query failed' }); }
});
app.get('/v1/admin/events', requireProjectAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id,name,user_id,properties,timestamp FROM events WHERE project_id=$1 ORDER BY timestamp DESC LIMIT 200',
      [req.projectId]
    );
    res.json({ events: result.rows });
  } catch { res.status(500).json({ error: 'Events query failed' }); }
});
app.get('/v1/admin/campaigns', requireProjectAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id,title,body,destination_path,status,created_at,sent_at FROM campaigns WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',
      [req.projectId]
    );
    res.json({ campaigns: result.rows });
  } catch { res.status(500).json({ error: 'Campaign query failed' }); }
});
app.post('/v1/admin/push/send', requireProjectAdmin, async (req, res) => {
  if (!pub || !priv) return res.status(503).json({ error: 'VAPID keys missing' });
  const { title, body, url = '/' } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof body !== 'string' || !body.trim() || body.length > 2000)
    return res.status(400).json({ error: 'Title/body required; max 120/2000 chars' });
  if (!validPath(url)) return res.status(400).json({ error: 'Use a safe relative destination path' });
  const client = await pool.connect();
  let campaignId;
  try {
    const created = await client.query(
      `INSERT INTO campaigns(project_id,title,body,destination_path,status)
       VALUES($1,$2,$3,$4,'sending') RETURNING id`,
      [req.projectId, title.trim(), body.trim(), url]
    );
    campaignId = created.rows[0].id;
    const subscribers = await client.query(
      'SELECT id,subscription FROM push_subscribers WHERE project_id=$1',
      [req.projectId]
    );
    let sent = 0, failed = 0;
    for (const subscriber of subscribers.rows) {
      try {
        await webpush.sendNotification(subscriber.subscription, JSON.stringify({ title: title.trim(), body: body.trim(), url }), { TTL: 3600 });
        sent++;
        await client.query(
          "INSERT INTO campaign_results(campaign_id,subscriber_id,status) VALUES($1,$2,'sent')",
          [campaignId, subscriber.id]
        );
      } catch (error) {
        failed++;
        const expired = [404, 410].includes(error.statusCode);
        await client.query(
          'INSERT INTO campaign_results(campaign_id,subscriber_id,status,response_code,error_message) VALUES($1,$2,$3,$4,$5)',
          [campaignId, subscriber.id, expired ? 'expired' : 'failed', error.statusCode || null, String(error.message || 'Delivery failed').slice(0, 500)]
        );
        if (expired) await client.query('DELETE FROM push_subscribers WHERE project_id=$1 AND id=$2', [req.projectId, subscriber.id]);
      }
    }
    await client.query("UPDATE campaigns SET status='sent',sent_at=NOW() WHERE id=$1", [campaignId]);
    res.json({ campaignId, total: subscribers.rowCount, sent, failed });
  } catch {
    if (campaignId) await client.query("UPDATE campaigns SET status='failed' WHERE id=$1", [campaignId]).catch(() => {});
    res.status(500).json({ error: 'Send failed' });
  } finally { client.release(); }
});

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin blocked') return res.status(403).json({ error: 'Origin blocked' });
  res.status(400).json({ error: 'Bad request' });
});

export { app, pool };
if (process.env.VERCEL !== '1') {
  const server = app.listen(port, () => console.log('EngageKit API listening on ' + port));
  async function stop() { server.close(); await pool.end(); process.exit(0); }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
