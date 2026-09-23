'use strict';

const crypto = require('crypto');

function createGmailDirect(opts){
  const pool = opts.pool;
  const webOrigin = String(opts.webOrigin||'').replace(/\/$/,'');
  const apiOrigin = String(opts.apiOrigin||'').replace(/\/$/,'');
  const secret = String(opts.secret||'');
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID||'').trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET||'').trim();
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || (apiOrigin + '/v1/google/oauth/callback')).trim();
  const intervalMs = Math.max(5*60*1000, Number(process.env.GMAIL_SYNC_INTERVAL_MS)||20*60*1000);
  let syncing=false, timer=null;

  function configured(){ return Boolean(clientId && clientSecret && redirectUri && pool); }
  function key(){
    if(!secret) return null;
    return crypto.createHash('sha256').update(secret+'|dg-google-oauth-v10','utf8').digest();
  }
  function enc(v){
    const k=key(); if(!k) throw new Error('OAuth-Verschluesselung ist nicht verfuegbar.');
    const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',k,iv);
    const ct=Buffer.concat([c.update(String(v||''),'utf8'),c.final()]);
    return {ct:ct.toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64')};
  }
  function dec(r){
    const k=key(); if(!k) throw new Error('OAuth-Verschluesselung ist nicht verfuegbar.');
    const d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(String(r.refresh_iv||''),'base64'));
    d.setAuthTag(Buffer.from(String(r.refresh_tag||''),'base64'));
    return Buffer.concat([d.update(Buffer.from(String(r.refresh_ciphertext||''),'base64')),d.final()]).toString('utf8');
  }

  async function init(){
    if(!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS google_oauth_tokens_v10(
        provider TEXT PRIMARY KEY,
        account_email TEXT,
        refresh_ciphertext TEXT NOT NULL,
        refresh_iv TEXT NOT NULL,
        refresh_tag TEXT NOT NULL,
        scope TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gmail_import_messages_v10(
        message_id TEXT PRIMARY KEY,
        thread_id TEXT,
        inquiry_id TEXT,
        sender TEXT,
        subject TEXT,
        received_at_text TEXT,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gmail_import_messages_v10_inquiry_idx
        ON gmail_import_messages_v10(inquiry_id);
    `);
  }

  async function row(){
    const q=await pool.query("SELECT * FROM google_oauth_tokens_v10 WHERE provider='gmail' LIMIT 1");
    return q.rows[0]||null;
  }
  async function authUrl(actor){
    if(!configured()) return '';
    const state=crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ['gmail_oauth_state:'+state,JSON.stringify({actor:String(actor||''),expires:new Date(Date.now()+10*60*1000).toISOString()})]
    );
    const q=new URLSearchParams({
      client_id:clientId,redirect_uri:redirectUri,response_type:'code',access_type:'offline',
      prompt:'consent',include_granted_scopes:'true',
      scope:'openid email https://www.googleapis.com/auth/gmail.readonly',state
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?'+q.toString();
  }
  async function exchange(code){
    const b=new URLSearchParams({code:String(code||''),client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'});
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});
    const x=await r.json().catch(()=>({}));
    if(!r.ok||!x.access_token) throw new Error(String(x.error_description||x.error||('Google OAuth HTTP '+r.status)));
    return x;
  }
  async function accessToken(){
    const r=await row(); if(!r) return '';
    const b=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:dec(r),grant_type:'refresh_token'});
    const q=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});
    const x=await q.json().catch(()=>({}));
    if(!q.ok||!x.access_token) throw new Error(String(x.error_description||x.error||('Gmail Token HTTP '+q.status)));
    return String(x.access_token);
  }
  async function api(token,path){
    const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+token}});
    const x=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(String(x&&x.error&&x.error.message||('Gmail HTTP '+r.status)));
    return x;
  }
  function b64(v){
    const s=String(v||'').replace(/-/g,'+').replace(/_/g,'/');
    return Buffer.from(s+(s.length%4?'='.repeat(4-s.length%4):''),'base64').toString('utf8');
  }
  function headers(p){
    const o={}; for(const h of (p&&p.headers||[])) o[String(h.name||'').toLowerCase()]=String(h.value||'');
    return o;
  }
  function bodyText(p){
    if(!p) return '';
    if(String(p.mimeType||'').toLowerCase()==='text/plain'&&p.body&&p.body.data) return b64(p.body.data);
    let html='';
    for(const x of (p.parts||[])){
      const t=bodyText(x); if(t) return t;
      if(!html&&String(x.mimeType||'').toLowerCase()==='text/html'&&x.body&&x.body.data) html=b64(x.body.data);
    }
    if(!html&&String(p.mimeType||'').toLowerCase()==='text/html'&&p.body&&p.body.data) html=b64(p.body.data);
    return html?html.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/[ \t]+/g,' ').trim():'';
  }
  function sender(raw){
    raw=String(raw||'').trim();
    const m=raw.match(/<\s*([^>\s]+@[^>\s]+)\s*>/i), p=raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email=String((m&&m[1])||(p&&p[0])||'').toLowerCase();
    return {email,name:raw.replace(/<[^>]+>/g,'').replace(/^"|"$/g,'').trim()||email};
  }
  function field(text,rx){
    const m=String(text||'').match(new RegExp('(?:^|\\n)\\s*(?:'+rx+')\\s*[:=-]\\s*([^\\n\\r]+)','i'));
    return m?String(m[1]||'').trim():'';
  }
  function attachments(p,messageId){
    const a=[]; function walk(x){for(const y of (x&&x.parts||[])){if(y.filename&&y.body&&y.body.attachmentId)a.push({source:'Gmail',messageId:String(messageId),attachmentId:String(y.body.attachmentId),name:String(y.filename),mime:String(y.mimeType||''),size:Number(y.body.size||0)});walk(y);}} walk(p); return a.slice(0,20);
  }
  function classify(msg){
    const h=headers(msg.payload||{}), from=sender(h.from), to=String(h.to||''), subject=String(h.subject||'').trim();
    let text=bodyText(msg.payload||{}).replace(/\r/g,'').trim(); if(text.length>7000) text=text.slice(0,7000);
    const mail=from.email, own=/^(kontakt@delgesso\.info|delgessomichael@gmail\.com)$/i.test(mail);
    let source='',customer='',email='',phone='',postalCode='',city='';
    if(/handwerk@check24\.de/i.test(mail)){
      source='CHECK24'; customer=((subject.match(/Neue Kontaktdaten von (.+?) erhalten/i)||[])[1]||(subject.match(/neue Nachricht von (.+?) erhalten/i)||[])[1]||field(text,'Name|Kunde')).trim();
    }else if(/noreply@trustlocal\.de/i.test(mail)){
      source='Trustlocal'; customer=((subject.match(/^Anfrage von\s+(.+?)\s+f(?:ü|u)r/i)||[])[1]||field(text,'Name|Kunde')).trim();
    }else if(/info@aqon-pure\.com/i.test(mail)){
      source='AQON PURE'; customer=((subject.match(/Neuer Einbauauftrag f(?:ü|u)r AQON PURE bei\s+(.+)$/i)||[])[1]||field(text,'Name|Kunde')).trim();
    }else if(/kontakt@delgesso\.info/i.test(mail)&&/^(Anfrage:|Kontaktanfrage)/i.test(subject)){
      source='Website'; customer=field(text,'Name|Kunde')||((subject.match(/[–-]\s*(.+)$/)||[])[1]||'').trim();
    }else if(!own&&(/kontakt@delgesso\.info/i.test(to)||to==='')){
      source='E-Mail'; customer=from.name;
    }else return null;
    email=field(text,'E-Mail|Email|Mail')||from.email;
    phone=field(text,'Telefon|Tel\\.?|Mobil|Handy');
    if(!phone){const m=text.match(/(?:Telefon|Mobil|Tel\.?|Handy)?[^+0-9]{0,12}(\+?[0-9][0-9 ()\/-]{6,})/i); if(m) phone=String(m[1]||'').trim();}
    postalCode=field(text,'PLZ|Postleitzahl'); city=field(text,'Ort|Stadt');
    if(!customer) customer=email||from.name||'Gmail-Anfrage';
    return {source,customer,email,phone,postalCode,city,subject,description:text};
  }

  async function importMessage(msg){
    const id=String(msg.id||''); if(!id) return {ignored:true};
    const seen=await pool.query('SELECT inquiry_id FROM gmail_import_messages_v10 WHERE message_id=$1',[id]);
    if(seen.rowCount) return {duplicate:true,inquiryId:String(seen.rows[0].inquiry_id||'')};
    const h=headers(msg.payload||{}), rec=classify(msg), received=new Date(Number(msg.internalDate)||Date.now()).toISOString();
    if(!rec){
      await pool.query('INSERT INTO gmail_import_messages_v10(message_id,thread_id,sender,subject,received_at_text) VALUES($1,$2,$3,$4,$5) ON CONFLICT(message_id) DO NOTHING',[id,String(msg.threadId||''),String(h.from||''),String(h.subject||''),received]);
      return {ignored:true};
    }
    const inquiryId='GM-INQ-'+crypto.randomUUID();
    await pool.query(
      `INSERT INTO customer_inquiries_shadow(
        id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,
        created_at_text,changed_at_text,changed_by,attachments_json,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Neu',false,$11,$11,'Gmail Railway',$12,now())`,
      [inquiryId,rec.source,id,rec.customer,rec.email,rec.phone,rec.postalCode,rec.city,rec.subject,rec.description,received,JSON.stringify(attachments(msg.payload||{},id))]
    );
    await pool.query('INSERT INTO gmail_import_messages_v10(message_id,thread_id,inquiry_id,sender,subject,received_at_text) VALUES($1,$2,$3,$4,$5,$6)',[id,String(msg.threadId||''),inquiryId,String(h.from||''),rec.subject,received]);
    return {imported:true,inquiryId,source:rec.source};
  }

  async function sync(){
    if(syncing) return {ok:true,skipped:true,reason:'busy'};
    if(!configured()) return {ok:true,configured:false,connected:false,needsConfiguration:true,redirectUri};
    const r=await row(); if(!r) return {ok:true,configured:true,connected:false,needsConnect:true,redirectUri};
    syncing=true;
    try{
      const token=await accessToken(), query='in:inbox newer_than:30d -category:promotions -category:social';
      let pageToken='',ids=[];
      for(let page=0;page<2;page++){
        const q=new URLSearchParams({q:query,maxResults:'100'}); if(pageToken) q.set('pageToken',pageToken);
        const list=await api(token,'messages?'+q.toString());
        ids.push(...(list.messages||[]).map(x=>String(x.id||'')).filter(Boolean));
        pageToken=String(list.nextPageToken||''); if(!pageToken) break;
      }
      let imported=0,ignored=0,duplicates=0,failed=0; const sources={};
      for(const id of ids){
        try{
          const msg=await api(token,'messages/'+encodeURIComponent(id)+'?format=full'), x=await importMessage(msg);
          if(x.imported){imported++;sources[x.source]=(sources[x.source]||0)+1;} else if(x.duplicate) duplicates++; else ignored++;
        }catch(e){failed++;console.error('GMAIL_IMPORT message='+id+' error='+e.message);}
      }
      const summary={at:new Date().toISOString(),scanned:ids.length,imported,ignored,duplicates,failed,sources};
      await pool.query(`INSERT INTO app_meta(key,value) VALUES('gmail_last_sync_v10',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(summary)]);
      return Object.assign({ok:true,configured:true,connected:true,email:String(r.account_email||'')},summary);
    }finally{syncing=false;}
  }

  async function status(){
    const r=await row(); let last=null;
    const q=await pool.query("SELECT value,updated_at FROM app_meta WHERE key='gmail_last_sync_v10' LIMIT 1");
    if(q.rowCount) last=Object.assign({},q.rows[0].value||{},{updatedAt:q.rows[0].updated_at});
    return {configured:configured(),connected:Boolean(r),email:String(r&&r.account_email||''),redirectUri,lastSync:last};
  }

  async function callback(code,state){
    if(!configured()) throw new Error('Gmail OAuth ist auf Railway noch nicht konfiguriert.');
    const q=await pool.query('SELECT value FROM app_meta WHERE key=$1 LIMIT 1',['gmail_oauth_state:'+String(state||'')]);
    const v=q.rows[0]&&q.rows[0].value, exp=v&&Date.parse(String(v.expires||''));
    if(!q.rowCount||!exp||exp<Date.now()) throw new Error('Google OAuth Sitzung ist abgelaufen. Bitte in der App erneut verbinden.');
    const t=await exchange(code); if(!t.refresh_token) throw new Error('Google hat kein dauerhaftes Zugriffstoken geliefert.');
    const e=enc(t.refresh_token); let account='';
    try{const p=await api(t.access_token,'profile');account=String(p.emailAddress||'');}catch(_e){}
    await pool.query(
      `INSERT INTO google_oauth_tokens_v10(provider,account_email,refresh_ciphertext,refresh_iv,refresh_tag,scope,updated_at)
       VALUES('gmail',$1,$2,$3,$4,$5,now())
       ON CONFLICT(provider) DO UPDATE SET account_email=EXCLUDED.account_email,refresh_ciphertext=EXCLUDED.refresh_ciphertext,
       refresh_iv=EXCLUDED.refresh_iv,refresh_tag=EXCLUDED.refresh_tag,scope=EXCLUDED.scope,updated_at=now()`,
      [account,e.ct,e.iv,e.tag,String(t.scope||'')]
    );
    await pool.query('DELETE FROM app_meta WHERE key=$1',['gmail_oauth_state:'+String(state||'')]);
    setImmediate(()=>sync().catch(err=>console.error('GMAIL first sync failed',err.message)));
    return {ok:true,email:account};
  }

  async function syncForUser(actor){
    const r=await sync();
    if(r.needsConnect) r.authUrl=await authUrl(actor);
    return r;
  }

  function start(){
    if(timer||!pool) return;
    timer=setInterval(()=>sync().catch(e=>console.error('GMAIL scheduled sync failed',e.message)),intervalMs);
    if(timer.unref) timer.unref();
    setTimeout(()=>sync().catch(e=>console.error('GMAIL startup sync failed',e.message)),15000);
  }

  return {init,start,status,syncForUser,callback,authUrl,configured};
}

module.exports={createGmailDirect};
