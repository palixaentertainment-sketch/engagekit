import express from 'express';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { deliverPushBatch } from './push-delivery.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const safePath = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');

export function createAccountRouter(pool) {
  const router = express.Router();
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;

  const authAttempts = new Map();
  function limitAuth(req, res, next) {
    const now = Date.now(), key = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = authAttempts.get(key);
    if (!entry || now - entry.start > 15 * 60 * 1000) authAttempts.set(key, { start: now, count: 1 });
    else if (++entry.count > 12) return res.status(429).json({ error: 'Too many authentication attempts. Try again in 15 minutes.' });
    if (authAttempts.size > 5000) for (const [k,v] of authAttempts) if (now-v.start > 15*60*1000) authAttempts.delete(k);
    next();
  }

  async function authRequest(path, body) {
    if (!supabaseUrl || !anonKey) {
      console.error('[auth] configuration missing', { hasSupabaseUrl: Boolean(supabaseUrl), hasAnonKey: Boolean(anonKey) });
      throw Object.assign(new Error('Supabase Auth is not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.'), { status: 503 });
    }
    let response;
    try {
      response = await fetch(supabaseUrl + '/auth/v1/' + path, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: anonKey },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      console.error('[auth] Supabase request failed before receiving a response', {
        operation: path.split('?')[0], name: error?.name || 'Error',
        code: error?.cause?.code || error?.code || null,
        message: String(error?.message || 'Network request failed').slice(0, 300)
      });
      throw Object.assign(new Error('Could not reach Supabase Auth. Check the Supabase project URL and network availability.'), { status: 503 });
    }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) {
      const providerMessage = data.msg || data.message || data.error_description || data.error;
      const message = typeof providerMessage === 'string' ? providerMessage : 'Supabase rejected the authentication request.';
      console.error('[auth] Supabase rejected authentication request', {
        operation: path.split('?')[0], status: response.status,
        code: data.code || data.error_code || null,
        message: message.slice(0, 300),
        requestId: response.headers.get('sb-request-id') || response.headers.get('x-request-id') || null,
        responseType: response.headers.get('content-type') || 'unknown'
      });
      throw Object.assign(new Error(message), { status: response.status });
    }
    if (!raw) return {};
    if (!Object.keys(data).length && raw) {
      console.error('[auth] Supabase returned a non-JSON success response', {
        operation: path.split('?')[0], status: response.status,
        responseType: response.headers.get('content-type') || 'unknown'
      });
      throw Object.assign(new Error('Supabase returned an unexpected response. Check the Vercel function logs.'), { status: 502 });
    }
    return data;
  }

  async function requireUser(req, res, next) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || match[1].length > 8192) return res.status(401).json({ error: 'Sign in required.' });
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Authentication is not configured.' });
    try {
      const response = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: anonKey, authorization: 'Bearer ' + match[1] } });
      if (!response.ok) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      req.user = await response.json();
      if (!req.user?.id) return res.status(401).json({ error: 'Invalid session.' });
      next();
    } catch { res.status(503).json({ error: 'Authentication service unavailable.' }); }
  }

  async function ownedProject(req, res, next) {
    try {
      const result = await pool.query('SELECT id,name,slug,website_url,created_at FROM projects WHERE id=$1 AND owner_id=$2', [req.params.projectId, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Project not found.' });
      req.project = result.rows[0]; next();
    } catch { res.status(500).json({ error: 'Project lookup failed.' }); }
  }

  router.post('/auth/signup', limitAuth, async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof password !== 'string' || password.length < 8 || password.length > 128)
      return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
    try { res.status(201).json(await authRequest('signup', { email: email.trim(), password })); }
    catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });

  router.post('/auth/signin', limitAuth, async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
    try { res.json(await authRequest('token?grant_type=password', { email: email.trim(), password })); }
    catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });

  router.post('/auth/recover', limitAuth, async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ error: 'Enter your account email.' });
    try { res.json(await authRequest('recover', { email: email.trim() })); }
    catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });

  router.get('/account/me', requireUser, (req, res) => res.json({ user: { id: req.user.id, email: req.user.email } }));

  router.get('/account/projects', requireUser, async (req, res) => {
    try {
      const result = await pool.query(`SELECT p.id,p.name,p.slug,p.website_url,p.created_at,
        (SELECT COUNT(*)::int FROM push_subscribers s WHERE s.project_id=p.id) AS subscribers,
        (SELECT COUNT(*)::int FROM events e WHERE e.project_id=p.id) AS events,
        (SELECT COUNT(*)::int FROM campaigns c WHERE c.project_id=p.id) AS campaigns
        FROM projects p WHERE p.owner_id=$1 ORDER BY p.created_at DESC`, [req.user.id]);
      res.json({ projects: result.rows });
    } catch { res.status(500).json({ error: 'Could not load projects. Check the account migration.' }); }
  });

  router.post('/account/projects', requireUser, async (req, res) => {
    const { name, slug, websiteUrl } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
      return res.status(400).json({ error: 'Project name must be 2–100 characters.' });
    if (typeof slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug))
      return res.status(400).json({ error: 'Use a lowercase slug with letters, numbers and hyphens.' });
    let website = null;
    if (websiteUrl) { try { const u = new URL(websiteUrl); if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw Error(); website = u.toString(); } catch { return res.status(400).json({ error: 'Enter a valid website URL.' }); } }
    const publicKey = 'ek_pub_' + crypto.randomBytes(32).toString('base64url');
    const secretKey = 'ek_sec_' + crypto.randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = await client.query('INSERT INTO projects(owner_id,name,slug,website_url) VALUES($1,$2,$3,$4) RETURNING id,name,slug,website_url,created_at', [req.user.id,name.trim(),slug,website]);
      await client.query('INSERT INTO api_keys(project_id,name,key_prefix,key_hash,key_type) VALUES($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)',
        [p.rows[0].id,'Public browser key',publicKey.slice(0,16),hash(publicKey),'public','Default secret key',secretKey.slice(0,16),hash(secretKey),'secret']);
      await client.query('COMMIT');
      res.status(201).json({ project:p.rows[0], publicKey, secretKey, warning:'Copy the secret key now. It is shown only once.' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'That project slug is already in use.' });
      res.status(500).json({ error: 'Project creation failed.' });
    } finally { client.release(); }
  });

  router.get('/account/projects/:projectId', requireUser, ownedProject, (req,res) => res.json({project:req.project}));

  router.patch('/account/projects/:projectId', requireUser, ownedProject, async (req,res) => {
    const {name,websiteUrl}=req.body||{};
    if(typeof name!=='string'||name.trim().length<2||name.trim().length>100) return res.status(400).json({error:'Project name must be 2–100 characters.'});
    let website=null;
    if(websiteUrl){try{const u=new URL(websiteUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();website=u.toString();}catch{return res.status(400).json({error:'Enter a valid website URL.'});}}
    try{const r=await pool.query('UPDATE projects SET name=$1,website_url=$2,updated_at=NOW() WHERE id=$3 AND owner_id=$4 RETURNING id,name,slug,website_url,created_at',[name.trim(),website,req.project.id,req.user.id]);res.json({project:r.rows[0]});}
    catch{res.status(500).json({error:'Project update failed.'});}
  });

  router.delete('/account/projects/:projectId', requireUser, ownedProject, async (req,res) => {
    try{await pool.query('DELETE FROM projects WHERE id=$1 AND owner_id=$2',[req.project.id,req.user.id]);res.json({ok:true});}
    catch{res.status(500).json({error:'Project could not be deleted.'});}
  });

  router.get('/account/projects/:projectId/keys', requireUser, ownedProject, async (req,res) => {
    try{const r=await pool.query('SELECT id,name,key_prefix,key_type,created_at,last_used_at,revoked_at FROM api_keys WHERE project_id=$1 ORDER BY created_at DESC',[req.project.id]);res.json({keys:r.rows});}
    catch{res.status(500).json({error:'Could not load API keys.'});}
  });

  router.post('/account/projects/:projectId/keys', requireUser, ownedProject, async (req,res) => {
    const type=req.body?.keyType==='public'?'public':'secret';
    const name=typeof req.body?.name==='string'?req.body.name.trim():'';
    if(!name||name.length>80)return res.status(400).json({error:'Key name must be 1–80 characters.'});
    const raw=(type==='public'?'ek_pub_':'ek_sec_')+crypto.randomBytes(32).toString('base64url');
    try{const r=await pool.query('INSERT INTO api_keys(project_id,name,key_prefix,key_hash,key_type) VALUES($1,$2,$3,$4,$5) RETURNING id,name,key_prefix,key_type,created_at',[req.project.id,name,raw.slice(0,16),hash(raw),type]);res.status(201).json({key:r.rows[0],secret:raw});}
    catch{res.status(500).json({error:'Key could not be created.'});}
  });

  router.post('/account/projects/:projectId/keys/:keyId/revoke', requireUser, ownedProject, async (req,res) => {
    try{const r=await pool.query('UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND project_id=$2 AND revoked_at IS NULL RETURNING id',[req.params.keyId,req.project.id]);if(!r.rowCount)return res.status(404).json({error:'Active key not found.'});res.json({ok:true});}
    catch{res.status(500).json({error:'Key could not be revoked.'});}
  });

  router.get('/account/projects/:projectId/overview', requireUser, ownedProject, async (req,res) => {
    try{
      const [s,e,c,recent]=await Promise.all([
        pool.query('SELECT COUNT(*)::int n FROM push_subscribers WHERE project_id=$1',[req.project.id]),
        pool.query('SELECT COUNT(*)::int n FROM events WHERE project_id=$1',[req.project.id]),
        pool.query('SELECT COUNT(*)::int n FROM campaigns WHERE project_id=$1',[req.project.id]),
        pool.query("SELECT COUNT(*)::int n FROM events WHERE project_id=$1 AND timestamp >= NOW()-INTERVAL '7 days'",[req.project.id])
      ]);
      res.json({subscribers:s.rows[0].n,events:e.rows[0].n,campaigns:c.rows[0].n,events7d:recent.rows[0].n});
    }catch{res.status(500).json({error:'Could not load project overview.'});}
  });

  router.get('/account/projects/:projectId/subscribers', requireUser, ownedProject, async (req,res) => {
    try{const r=await pool.query('SELECT id,created_at,updated_at FROM push_subscribers WHERE project_id=$1 ORDER BY created_at DESC LIMIT 500',[req.project.id]);res.json({subscribers:r.rows});}
    catch{res.status(500).json({error:'Could not load subscribers.'});}
  });
  router.get('/account/projects/:projectId/events', requireUser, ownedProject, async (req,res) => {
    try{const r=await pool.query('SELECT id,name,user_id,properties,timestamp FROM events WHERE project_id=$1 ORDER BY timestamp DESC LIMIT 200',[req.project.id]);res.json({events:r.rows});}
    catch{res.status(500).json({error:'Could not load events.'});}
  });
  router.get('/account/projects/:projectId/campaigns', requireUser, ownedProject, async (req,res) => {
    try{const r=await pool.query('SELECT id,title,body,destination_path,status,created_at,sent_at,(SELECT COUNT(*)::int FROM campaign_results cr WHERE cr.campaign_id=c.id AND cr.status=\'sent\') sent,(SELECT COUNT(*)::int FROM campaign_results cr WHERE cr.campaign_id=c.id AND cr.status IN (\'failed\',\'expired\')) failed FROM campaigns c WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[req.project.id]);res.json({campaigns:r.rows});}
    catch{res.status(500).json({error:'Could not load campaigns.'});}
  });

  router.post('/account/projects/:projectId/push/send', requireUser, ownedProject, async (req,res) => {
    const pub=process.env.VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY;
    if(!pub||!priv)return res.status(503).json({error:'Push delivery is not configured yet.'});
    const {title,body,url='/'}=req.body||{};
    if(typeof title!=='string'||!title.trim()||title.length>120||typeof body!=='string'||!body.trim()||body.length>2000)return res.status(400).json({error:'Add a title and message (maximum 120 and 2,000 characters).'});
    if(!safePath(url))return res.status(400).json({error:'Destination must be a safe relative path.'});
    let campaignId;
    try{
      const created=await pool.query("INSERT INTO campaigns(project_id,title,body,destination_path,status) VALUES($1,$2,$3,$4,'sending') RETURNING id",[req.project.id,title.trim(),body.trim(),url]);
      campaignId=created.rows[0].id;
      const subscribers=await pool.query('SELECT id,subscription FROM push_subscribers WHERE project_id=$1',[req.project.id]);
      webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:support@engagekit.app',pub,priv);
      const totals=await deliverPushBatch({
        subscribers:subscribers.rows,
        concurrency:Number(process.env.PUSH_DELIVERY_CONCURRENCY||10),
        deliver:item=>webpush.sendNotification(item.subscription,JSON.stringify({title:title.trim(),body:body.trim(),url}),{TTL:3600}),
        recordResult:(item,result)=>pool.query(
          'INSERT INTO campaign_results(campaign_id,subscriber_id,status,response_code,error_message) VALUES($1,$2,$3,$4,$5)',
          [campaignId,item.id,result.status,result.responseCode||null,result.errorMessage||null]
        ),
        removeSubscriber:item=>pool.query('DELETE FROM push_subscribers WHERE project_id=$1 AND id=$2',[req.project.id,item.id])
      });
      await pool.query("UPDATE campaigns SET status='sent',sent_at=NOW() WHERE id=$1",[campaignId]);
      res.json({campaignId,...totals});
    }catch{
      if(campaignId)await pool.query("UPDATE campaigns SET status='failed' WHERE id=$1",[campaignId]).catch(()=>{});
      res.status(500).json({error:'Campaign could not be sent. Some notifications may already have been delivered; check campaign results before retrying.'});
    }
  });

  return router;
}
