(() => {
  const $ = (id) => document.getElementById(id);
  const API = '/v1';
  const state = { demo: true, token: '', mode: 'signin', project: null, projects: [], subscribers: [], events: [] };
  const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = v => v ? new Date(v).toLocaleString() : '—';
  const show = (el, yes=true) => el?.classList.toggle('hidden', !yes);
  const message = (id, text, error=false) => { const el=$(id); if(el){el.textContent=text;el.classList.toggle('error',error);} };
  function demoResponse(path, options={}) {
    const method = options.method || 'GET';
    const sampleProject = { id:'demo-project-1', name:'Acme Website', slug:'acme-website', website_url:'https://example.com', subscribers:1284, events:9360, campaigns:12, created_at:'2026-10-01T10:00:00Z' };
    const sampleEvents = [
      {id:'ev-101',name:'page_view',user_id:'visitor_84',timestamp:'2026-11-22T10:42:00Z',properties:{page:'/pricing'}},
      {id:'ev-102',name:'signup',user_id:'visitor_12',timestamp:'2026-11-22T10:39:00Z',properties:{source:'newsletter'}},
      {id:'ev-103',name:'button_click',user_id:'visitor_41',timestamp:'2026-11-22T10:31:00Z',properties:{button:'Get started'}},
      {id:'ev-104',name:'page_view',user_id:'visitor_07',timestamp:'2026-11-22T10:28:00Z',properties:{page:'/blog'}},
      {id:'ev-105',name:'purchase',user_id:'visitor_29',timestamp:'2026-11-22T10:20:00Z',properties:{plan:'pro'}}
    ];
    if(path==='/account/projects' && method==='GET') return {projects:[sampleProject]};
    if(path==='/account/projects' && method==='POST') { const p={...sampleProject,id:'demo-project-'+Date.now(),name:JSON.parse(options.body||'{}').name||'New Demo Project',slug:JSON.parse(options.body||'{}').slug||'new-demo-project',website_url:JSON.parse(options.body||'{}').websiteUrl||null,subscribers:0,events:0,campaigns:0};state.projects.unshift(p);return {project:p,publicKey:'ek_pub_demo_sample',secretKey:'ek_sec_demo_sample'}; }
    if(path==='/account/me') return {user:{email:'demo@engagekit.test'}};
    if(path.endsWith('/overview')) return {subscribers:1284,events:9360,campaigns:12,events7d:2450};
    if(path.endsWith('/events')) return {events:sampleEvents};
    if(path.endsWith('/subscribers')) return {subscribers:Array.from({length:8},(_,i)=>({id:'subscriber_'+(i+1),created_at:'2026-11-'+String(22-i).padStart(2,'0')+'T09:00:00Z',updated_at:'2026-11-22T10:00:00Z'}))};
    if(path.endsWith('/campaigns')) return {campaigns:[{id:'c1',title:'November product update',status:'sent',sent:1200,failed:12,created_at:'2026-11-20T11:00:00Z'},{id:'c2',title:'Welcome campaign',status:'sent',sent:1180,failed:4,created_at:'2026-11-15T11:00:00Z'}]};
    if(path.endsWith('/keys')) return {keys:[{id:'k1',name:'Production browser key',key_prefix:'ek_pub_7af2',key_type:'public',created_at:'2026-11-01T10:00:00Z',revoked_at:null}]};
    if(path.endsWith('/push/send')) return {sent:1284,failed:0,total:1284};
    if(path.endsWith('/keys') && method==='POST') return {secret:'ek_pub_demo_new_key_not_real'};
    if(method==='PATCH') return {project:{...state.project,name:JSON.parse(options.body||'{}').name||state.project.name,website_url:JSON.parse(options.body||'{}').websiteUrl||null}};
    if(method==='DELETE') {state.projects=state.projects.filter(p=>p.id!==state.project?.id);return {ok:true};}
    return {ok:true};
  }
  async function request(path, options={}) {
    if(state.demo) return demoResponse(path,options);
    const headers = {'content-type':'application/json', ...(options.headers||{})};
    if(state.token) headers.authorization='Bearer '+state.token;
    let response;
    try {
      response=await fetch(API+path,{...options,headers,signal:options.signal||AbortSignal.timeout(20000)});
    } catch(error) {
      const reason=error?.name==='TimeoutError'?'The server took too long to respond (20 seconds).':'The browser could not reach the EngageKit server.';
      throw new Error(reason+' Check your connection, then try again. ('+(error?.name||'NetworkError')+')');
    }
    const raw=await response.text();
    let data={};
    try { data=raw?JSON.parse(raw):{}; } catch {}
    if(!response.ok) {
      const detail=data.error||data.message||data.msg||data.error_description;
      const type=response.headers.get('content-type')||'unknown content type';
      const requestId=response.headers.get('x-vercel-id')||response.headers.get('sb-request-id')||response.headers.get('x-request-id');
      const snippet=String(detail||raw||'The server returned an empty response.').replace(/\\s+/g,' ').slice(0,500);
      throw new Error('Request failed (HTTP '+response.status+'). '+snippet+' [Response: '+type+(requestId?'; Request ID: '+requestId:'')+']');
    }
    if(raw&&!Object.keys(data).length) throw new Error('The server returned an unreadable response (HTTP '+response.status+', '+(response.headers.get('content-type')||'unknown content type')+').');
    return data;
  }
  function authView(){show($('auth-view'),true);show($('app-view'),false);$('user-label').textContent='';show($('signout'),false);}
  function appView(user){show($('auth-view'),false);show($('app-view'),true);$('user-label').textContent=user?.email||'';show($('signout'),true);loadProjects();}
  function setMode(mode){state.mode=mode;const signup=mode==='signup';$('auth-title').textContent=signup?'Create your account.':'Welcome back.';$('auth-copy').textContent=signup?'Start managing your website engagement.':'Sign in to manage your websites and notifications.';$('auth-submit').textContent=signup?'Create account':'Sign in';$('password').autocomplete=signup?'new-password':'current-password';$('switch-copy').textContent=signup?'Already have an account?':'New to EngageKit?';$('switch-mode').textContent=signup?'Sign in':'Create an account';show($('forgot'),!signup);message('auth-message','');}
  $('switch-mode').addEventListener('click',()=>setMode(state.mode==='signin'?'signup':'signin'));
  $('auth-form').addEventListener('submit',async e=>{e.preventDefault();const btn=$('auth-submit');btn.disabled=true;message('auth-message','Please wait…');try{const data=await request('/auth/'+(state.mode==='signup'?'signup':'signin'),{method:'POST',body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});if(state.mode==='signup'&&!data.access_token){message('auth-message','Account created. Check your email to confirm, then sign in.');setMode('signin');return;}state.token=data.access_token;localStorage.setItem('ek_access_token',state.token);appView(data.user);}catch(err){message('auth-message',err.message,true);}finally{btn.disabled=false;}});
  $('forgot').addEventListener('click',async()=>{const email=$('email').value.trim();if(!email){message('auth-message','Enter your email address first.',true);return;}try{await request('/auth/recover',{method:'POST',body:JSON.stringify({email})});message('auth-message','If the account exists, a recovery email has been sent.');}catch(err){message('auth-message',err.message,true);}});
  $('signout').addEventListener('click',()=>{state.token='';localStorage.removeItem('ek_access_token');state.project=null;authView();});
  $('new-project').addEventListener('click',()=>{show($('project-form'));$('project-name').focus();});
  $('cancel-project').addEventListener('click',()=>show($('project-form'),false));
  $('project-name').addEventListener('input',()=>{if(!$('project-slug').dataset.edited)$('project-slug').value=$('project-name').value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);});
  $('project-slug').addEventListener('input',()=>{$('project-slug').dataset.edited='1';});
  async function loadProjects(){try{const data=await request('/account/projects');state.projects=data.projects||[];renderProjects();}catch(err){if(/sign in|session expired/i.test(err.message)){state.token='';localStorage.removeItem('ek_access_token');authView();}else{$('project-list').innerHTML='<div class="card error">'+esc(err.message)+'</div>';}}}
  function renderProjects(){const root=$('project-list');$('empty-state').classList.toggle('hidden',state.projects.length>0);root.innerHTML=state.projects.map(p=>'<article class="project"><div class="project-card-head"><div><h3>'+esc(p.name)+'</h3><small>'+esc(p.website_url||p.slug)+'</small></div><span class="arrow">↗</span></div><div class="stats"><div><b>'+p.subscribers+'</b><small>Subscribers</small></div><div><b>'+p.events+'</b><small>Events</small></div><div><b>'+p.campaigns+'</b><small>Campaigns</small></div></div><button class="quiet open-project" data-open="'+esc(p.id)+'">Open project →</button></article>').join('');root.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openProject(b.dataset.open)));}
  $('create-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;message('project-message','Creating project…');try{const d=await request('/account/projects',{method:'POST',body:JSON.stringify({name:$('project-name').value.trim(),slug:$('project-slug').value.trim(),websiteUrl:$('website-url').value.trim()||null})});show($('project-form'),false);$('create-form').reset();$('project-slug').dataset.edited='';$('public-key').textContent=d.publicKey;$('secret-key').textContent=d.secretKey;show($('key-notice'));await loadProjects();}catch(err){message('project-message',err.message,true);}finally{btn.disabled=false;}});
  $('dismiss-keys').addEventListener('click',()=>show($('key-notice'),false));
  async function openProject(id){try{const p=state.projects.find(x=>x.id===id);const d=await request('/account/projects/'+encodeURIComponent(id));state.project=d.project;show($('workspace-view'),false);show($('project-view'),true);$('detail-name').textContent=state.project.name;$('detail-url').textContent=state.project.website_url||state.project.slug;$('detail-url').href=state.project.website_url||'#';$('settings-name').value=state.project.name;$('settings-url').value=state.project.website_url||'';await loadTab('overview');}catch(err){alert(err.message);}}
  $('back-projects').addEventListener('click',()=>{state.project=null;show($('project-view'),false);show($('workspace-view'),true);loadProjects();});
  $('refresh-project').addEventListener('click',()=>loadTab(document.querySelector('.tabs button.active')?.dataset.tab||'overview'));
  document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.addEventListener('click',()=>loadTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>loadTab(b.dataset.goto)));
  async function loadTab(tab){if(!state.project)return;document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.tab-panel').forEach(p=>show(p,p.id==='tab-'+tab));const id=encodeURIComponent(state.project.id);try{if(tab==='overview'){const [o,e]=await Promise.all([request('/account/projects/'+id+'/overview'),request('/account/projects/'+id+'/events')]);state.events=e.events||[];$('metrics').innerHTML=[['Subscribers',o.subscribers],['Events',o.events],['Campaigns',o.campaigns],['Events · 7 days',o.events7d]].map(x=>'<div class="metric"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');$('recent-events').innerHTML=table(['Event','User','Time'],state.events.slice(0,8).map(x=>[x.name,x.user_id||'—',date(x.timestamp)]));}else if(tab==='subscribers'){const d=await request('/account/projects/'+id+'/subscribers');state.subscribers=d.subscribers||[];$('subscriber-table').innerHTML=table(['Subscriber ID','Added','Updated'],state.subscribers.map(x=>[x.id,date(x.created_at),date(x.updated_at)]));}else if(tab==='events'){const d=await request('/account/projects/'+id+'/events');state.events=d.events||[];$('event-table').innerHTML=table(['Event','User','Time','Properties'],state.events.map(x=>[x.name,x.user_id||'—',date(x.timestamp),JSON.stringify(x.properties||{})]));}else if(tab==='campaigns'){const d=await request('/account/projects/'+id+'/campaigns');$('campaign-table').innerHTML=table(['Title','Status','Sent','Failed','Created'],(d.campaigns||[]).map(x=>[x.title,x.status,x.sent,x.failed,date(x.created_at)]));}else if(tab==='integration'){await loadKeys();$('integration-content').innerHTML='<p class="muted">Your public browser key is listed below. Keep secret keys on your server only. Add the EngageKit service worker at <code>/engagekit-sw.js</code> on your website and configure your integration to register it.</p>';}}catch(err){const target=$('tab-'+tab);if(target){let box=target.querySelector('.load-error');if(!box){box=document.createElement('p');box.className='message load-error error';target.prepend(box);}box.textContent=err.message;}}}
  function table(headers,rows){if(!rows.length)return '<div class="empty">Nothing here yet.</div>';return '<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
  async function loadKeys(){const d=await request('/account/projects/'+encodeURIComponent(state.project.id)+'/keys');$('key-table').innerHTML=table(['Name','Prefix','Type','Created','Action'],(d.keys||[]).map(k=>[k.name,k.key_prefix,k.key_type,date(k.created_at),k.revoked_at?'Revoked':'Active']));}
  $('send-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('send-button');b.disabled=true;message('send-message','Sending…');try{const d=await request('/account/projects/'+encodeURIComponent(state.project.id)+'/push/send',{method:'POST',body:JSON.stringify({title:$('push-title').value,body:$('push-body').value,url:$('push-url').value})});message('send-message','Completed: '+d.sent+' sent, '+d.failed+' failed, from '+d.total+' subscribers.');}catch(err){message('send-message',err.message,true);}finally{b.disabled=false;}});
  $('key-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await request('/account/projects/'+encodeURIComponent(state.project.id)+'/keys',{method:'POST',body:JSON.stringify({name:$('key-name').value,keyType:$('key-type').value})});$('new-key').innerHTML='<strong>Copy this key now. It will not be shown again.</strong><code>'+esc(d.secret)+'</code>';$('new-key').classList.remove('hidden');$('key-name').value='';await loadKeys();}catch(err){$('new-key').textContent=err.message;$('new-key').classList.remove('hidden');}});
  $('settings-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await request('/account/projects/'+encodeURIComponent(state.project.id),{method:'PATCH',body:JSON.stringify({name:$('settings-name').value,websiteUrl:$('settings-url').value||null})});state.project=d.project;$('detail-name').textContent=d.project.name;message('settings-message','Changes saved.');}catch(err){message('settings-message',err.message,true);}});
  $('delete-project').addEventListener('click',async()=>{if(!confirm('Permanently delete this project and all its data? This cannot be undone.'))return;try{await request('/account/projects/'+encodeURIComponent(state.project.id),{method:'DELETE'});state.project=null;show($('project-view'),false);show($('workspace-view'),true);await loadProjects();}catch(err){alert(err.message);}});
  function download(name,rows){const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
  $('download-subs').addEventListener('click',()=>download('engagekit-subscribers.csv',[['id','created_at','updated_at'],...state.subscribers.map(x=>[x.id,x.created_at,x.updated_at])]));$('download-events').addEventListener('click',()=>download('engagekit-events.csv',[['id','name','user_id','timestamp','properties'],...state.events.map(x=>[x.id,x.name,x.user_id,x.timestamp,JSON.stringify(x.properties)])]));
  setMode('signin');
  if(state.demo){ localStorage.removeItem('ek_access_token'); show($('auth-view'),false); show($('app-view'),true); show($('demo-banner'),true); $('user-label').textContent='Demo workspace'; state.projects=[]; loadProjects(); } else if(state.token)request('/account/me').then(d=>appView(d.user)).catch(()=>{state.token='';localStorage.removeItem('ek_access_token');authView();}); else authView();
})();