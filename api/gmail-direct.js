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

      CREATE TABLE IF NOT EXISTS finance_mail_v10(
        message_id TEXT PRIMARY KEY,
        thread_id TEXT,
        sender_email TEXT,
        sender_name TEXT,
        subject TEXT,
        received_at_text TEXT,
        category TEXT NOT NULL DEFAULT 'incoming',
        status TEXT NOT NULL DEFAULT 'open',
        paid_at_text TEXT,
        archived_at_text TEXT,
        attachments_json TEXT,
        gmail_label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS finance_mail_v10_status_idx
        ON finance_mail_v10(category,status,received_at_text DESC);
      CREATE INDEX IF NOT EXISTS finance_mail_v10_paid_idx
        ON finance_mail_v10(paid_at_text DESC);
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
      scope:'openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',state
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
    if(!q.ok||!x.access_token) throw new Error(String(x.error_description||x.error||('Google Token HTTP '+q.status)));
    return String(x.access_token);
  }
  async function api(token,path){
    const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+token}});
    const x=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(String(x&&x.error&&x.error.message||('Gmail HTTP '+r.status)));
    return x;
  }
  async function apiJson(token,method,path,body){
    const opt={method:String(method||'GET').toUpperCase(),headers:{Authorization:'Bearer '+token}};
    if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
    const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,opt);
    if(r.status===204)return {ok:true};
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(String(x&&x.error&&x.error.message||('Gmail HTTP '+r.status)));
    return x;
  }
  async function calendarApi(method,path,body){
    const token=await accessToken();
    if(!token)throw new Error('Google ist noch nicht verbunden.');
    const opt={method:String(method||'GET').toUpperCase(),headers:{Authorization:'Bearer '+token}};
    if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
    const r=await fetch('https://www.googleapis.com/calendar/v3/'+String(path||'').replace(/^\/+/,''),opt);
    if(r.status===204)return {ok:true};
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(String(x&&x.error&&x.error.message||('Google Calendar HTTP '+r.status)));
    return x;
  }
  async function googleConnection(){
    const r=await row();
    return {configured:configured(),connected:Boolean(r),email:String(r&&r.account_email||''),scope:String(r&&r.scope||'')};
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
  function inquiryNorm(v){
    return String(v||'').trim().toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }
  function firstMatch(text,rx){const m=String(text||'').match(rx);return m?String(m[1]||'').trim():'';}
  function directBody(text){
    let body=String(text||'').replace(/\r/g,'').trim();
    body=body.split(/\n(?:Von:|From:|-----Original Message-----|-----Urspr(?:ü|u)ngliche Nachricht-----|Am .{0,120} schrieb:)/i)[0].trim();
    return body.length>5000?body.slice(0,5000):body;
  }
  function attachmentNames(payload,messageId){return attachments(payload,messageId).map(x=>x.name).filter(Boolean);}
  function financeFileUrl(id){
    id=String(id||'').trim();
    return id?(apiOrigin+'/v1/files/'+encodeURIComponent(id)):'';
  }
  function b64buf(v){
    const s=String(v||'').replace(/-/g,'+').replace(/_/g,'/');
    return Buffer.from(s+(s.length%4?'='.repeat(4-s.length%4):''),'base64');
  }
  function financePartFiles(payload,messageId){
    const out=[];
    function walk(x){
      for(const y of (x&&x.parts||[])){
        const name=String(y.filename||'').trim(),body=y.body||{};
        if(name&&(body.attachmentId||body.data)){
          out.push({
            messageId:String(messageId||''),attachmentId:String(body.attachmentId||''),
            inlineData:String(body.data||''),name,mime:String(y.mimeType||'application/octet-stream'),
            size:Number(body.size||0)
          });
        }
        walk(y);
      }
    }
    walk(payload);
    return out.slice(0,30);
  }
  async function persistFinanceAttachments(token,msg){
    const files=financePartFiles(msg&&msg.payload||{},msg&&msg.id||'');
    const stored=[];
    for(const f of files){
      try{
        let data=Buffer.alloc(0);
        if(f.attachmentId){
          const x=await api(token,'messages/'+encodeURIComponent(f.messageId)+'/attachments/'+encodeURIComponent(f.attachmentId));
          data=b64buf(x&&x.data||'');
        }else if(f.inlineData)data=b64buf(f.inlineData);
        if(!data.length)continue;
        if(data.length>25*1024*1024){
          stored.push({name:f.name,mime:f.mime,size:data.length,tooLarge:true});
          continue;
        }
        const key=f.messageId+'|'+(f.attachmentId||crypto.createHash('sha256').update(data).digest('hex'))+'|'+f.name;
        const id='GMAILFIN-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,40);
        const sha=crypto.createHash('sha256').update(data).digest('hex');
        await pool.query(
          `INSERT INTO binary_files_v10(id,file_name,mime_type,file_size,sha256,file_data,source,kind,metadata,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,'gmail-finance','invoice-attachment',$7::jsonb,now())
           ON CONFLICT(id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,
             file_size=EXCLUDED.file_size,sha256=EXCLUDED.sha256,file_data=EXCLUDED.file_data,
             source=EXCLUDED.source,kind=EXCLUDED.kind,metadata=EXCLUDED.metadata,updated_at=now()`,
          [id,f.name,f.mime,data.length,sha,data,JSON.stringify({messageId:f.messageId,attachmentId:f.attachmentId||'',gmail:true})]
        );
        stored.push({fileId:id,name:f.name,mime:f.mime,size:data.length,url:financeFileUrl(id)});
      }catch(e){
        console.error('FINANCE_GMAIL attachment message='+f.messageId+' file='+f.name+' error='+e.message);
        stored.push({name:f.name,mime:f.mime,size:f.size||0,error:true});
      }
    }
    return stored;
  }
  async function persistInquiryAttachments(token,msg){
    const files=financePartFiles(msg&&msg.payload||{},msg&&msg.id||'');
    const stored=[];
    for(const f of files){
      try{
        let data=Buffer.alloc(0);
        if(f.attachmentId){
          const x=await api(token,'messages/'+encodeURIComponent(f.messageId)+'/attachments/'+encodeURIComponent(f.attachmentId));
          data=b64buf(x&&x.data||'');
        }else if(f.inlineData)data=b64buf(f.inlineData);
        if(!data.length)continue;
        if(data.length>25*1024*1024){
          stored.push({messageId:f.messageId,attachmentId:f.attachmentId,name:f.name,mime:f.mime,size:data.length,tooLarge:true});
          continue;
        }
        const key=f.messageId+'|'+(f.attachmentId||crypto.createHash('sha256').update(data).digest('hex'))+'|'+f.name;
        const id='GMAILINQ-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,40);
        const sha=crypto.createHash('sha256').update(data).digest('hex');
        await pool.query(
          `INSERT INTO binary_files_v10(id,file_name,mime_type,file_size,sha256,file_data,source,kind,metadata,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,'gmail-inquiry','inquiry-attachment',$7::jsonb,now())
           ON CONFLICT(id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,
             file_size=EXCLUDED.file_size,sha256=EXCLUDED.sha256,file_data=EXCLUDED.file_data,
             source=EXCLUDED.source,kind=EXCLUDED.kind,metadata=EXCLUDED.metadata,updated_at=now()`,
          [id,f.name,f.mime,data.length,sha,data,JSON.stringify({messageId:f.messageId,attachmentId:f.attachmentId||'',gmail:true})]
        );
        stored.push({
          fileId:id,messageId:f.messageId,attachmentId:f.attachmentId||'',
          name:f.name,mime:f.mime,size:data.length,url:financeFileUrl(id)
        });
      }catch(e){
        console.error('INQUIRY_GMAIL attachment message='+f.messageId+' file='+f.name+' error='+e.message);
        stored.push({messageId:f.messageId,attachmentId:f.attachmentId||'',name:f.name,mime:f.mime,size:f.size||0,error:true});
      }
    }
    return stored;
  }
  async function backfillInquiryAttachments(token){
    const q=await pool.query(
      `SELECT id,gmail_ids,attachments_json FROM customer_inquiries_shadow
        WHERE COALESCE(gmail_ids,'')<>'' ORDER BY shadow_updated_at DESC LIMIT 20`
    );
    let updated=0,failed=0;
    for(const row of q.rows){
      let current=[];try{current=JSON.parse(String(row.attachments_json||'[]'));if(!Array.isArray(current))current=[];}catch(_e){current=[];}
      const ids=[...new Set(String(row.gmail_ids||'').split('|').map(x=>x.trim()).filter(Boolean))];
      if(!ids.length)continue;
      let merged=current,changed=false;
      for(const id of ids){
        const hasStored=current.some(x=>String(x.messageId||'')===id&&x.fileId&&x.url);
        if(hasStored)continue;
        try{
          const msg=await api(token,'messages/'+encodeURIComponent(id)+'?format=full');
          const files=await persistInquiryAttachments(token,msg);
          if(files.length){merged=mergeAttachments(merged,files);changed=true;}
        }catch(e){failed++;console.error('INQUIRY_GMAIL attachment backfill message='+id+' error='+e.message);}
      }
      if(changed){
        await pool.query('UPDATE customer_inquiries_shadow SET attachments_json=$2,shadow_updated_at=now() WHERE id=$1',
          [String(row.id||''),JSON.stringify(merged)]);
        updated++;
      }
    }
    return {updated,failed};
  }

  async function backfillFinanceAttachments(token){
    const q=await pool.query(
      `SELECT message_id,attachments_json FROM finance_mail_v10
        WHERE COALESCE(provider,'gmail')='gmail' AND COALESCE(attachments_json,'')<>'' ORDER BY updated_at DESC LIMIT 20`
    );
    let updated=0,failed=0;
    for(const row of q.rows){
      let old=[];try{old=JSON.parse(String(row.attachments_json||'[]'));if(!Array.isArray(old))old=[];}catch(_e){old=[];}
      if(!old.length||old.every(x=>x&&x.fileId&&x.url))continue;
      try{
        const msg=await api(token,'messages/'+encodeURIComponent(String(row.message_id||''))+'?format=full');
        const files=await persistFinanceAttachments(token,msg);
        await pool.query('UPDATE finance_mail_v10 SET attachments_json=$2,updated_at=now() WHERE message_id=$1',
          [String(row.message_id||''),JSON.stringify(files)]);
        updated++;
      }catch(e){failed++;console.error('FINANCE_GMAIL attachment backfill message='+row.message_id+' error='+e.message);}
    }
    return {updated,failed};
  }
  async function openInquiryByEmail(email){
    email=String(email||'').trim().toLowerCase();if(!email)return null;
    const q=await pool.query(
      `SELECT * FROM customer_inquiries_shadow
        WHERE lower(COALESCE(email,''))=lower($1)
          AND COALESCE(status,'Neu') NOT IN ('Erledigt','Gelöscht','Übernommen','Archiviert')
        ORDER BY received_at_text DESC NULLS LAST LIMIT 1`,[email]
    );
    return q.rows[0]||null;
  }
  async function parseInquiry(msg){
    const h=headers(msg.payload||{}),from=sender(h.from),to=String(h.to||''),subject=String(h.subject||'').trim();
    const raw=bodyText(msg.payload||{}).replace(/\r/g,'').trim(),text=raw.length>7000?raw.slice(0,7000):raw;
    const mail=String(from.email||'').toLowerCase(),attNames=attachmentNames(msg.payload||{},msg.id);
    let source='',customer='',email='',phone='',postalCode='',city='',description='',externalUrl='',phoneUrl='',dropboxUrl='',aqonAppointmentUrl='',aqonDetails='';

    if(/kontakt@delgesso\.info/i.test(mail)&&/^(Anfrage:|Kontaktanfrage)/i.test(subject)){
      source='Webseite';
      customer=firstMatch(text,/(?:^|\n)Name:\s*([^\n\r]+)/i)||firstMatch(subject,/[–-]\s*(.+)$/);
      email=firstMatch(text,/(?:E-Mail|Ihre E-Mail):\s*([^\s\n\r]+)/i);
      phone=firstMatch(text,/Telefon(?:\s*\(optional\))?:\s*([^\n\r]+)/i);
      description=String(text.split(/Nachricht:\s*/i)[1]||'').trim().slice(0,3000);
    }else if(/handwerk@check24\.de/i.test(mail)&&/(Neuer Kunde|Neue Kontaktdaten|neue Nachricht)/i.test(subject)){
      source='CHECK24';
      customer=firstMatch(subject,/Neue Kontaktdaten von (.+?) erhalten/i)
        ||firstMatch(subject,/Sie haben eine neue Nachricht von (.+?) erhalten/i)
        ||firstMatch(text,/Kontakt zu\s+([^\n\r]+?)\s+auf(?:,|\s|$)/i)
        ||firstMatch(text,/Nachricht von\s+([^\n\r]+?)\s+auf CHECK24/i)
        ||firstMatch(text,/([A-ZÄÖÜ][^\n\r]{1,60}) hat Kontaktdaten geteilt/i);
      const loc=text.match(/\bin\s+(\d{5})\s+([A-Za-zÄÖÜäöüß\- ]{2,45})[.\n\r]/);
      postalCode=String(loc&&loc[1]||'');city=String(loc&&loc[2]||'').trim();
      const mails=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[]).filter(x=>!/@check24\.de$/i.test(x));
      email=String(mails[0]||'');
      phone=firstMatch(text,/(?:Telefon|Mobil|Tel.?)[^+0-9]{0,15}(\+?[0-9][0-9 ()\/-]{6,})/i);
      if(String(phone).replace(/\D/g,'').endsWith('30220127917'))phone='';
      externalUrl=String((text.match(/https:\/\/experts\.handwerk\.check24\.de\/plink\/craftsmen\/sp\/messenger\/[A-Za-z0-9_-]+/i)||[])[0]||'');
      description=subject;
      const job=firstMatch(text,/(Sanitär[^\n\r]{0,200}|Heizung[^\n\r]{0,200}|Klimaanlage[^\n\r]{0,200}|Wärmepumpe[^\n\r]{0,200})/i);
      if(job)description+=' - '+job;
      if(/neue Nachricht/i.test(subject)&&externalUrl)description+=' - Nachricht im CHECK24-Postfach öffnen';
    }else if(/noreply@trustlocal\.de/i.test(mail)&&/^Anfrage von .+ f(?:ü|u)r eine\(n\)/i.test(subject)){
      source='Trustlocal';
      customer=firstMatch(subject,/^Anfrage von\s+(.+?)\s+f(?:ü|u)r eine\(n\)/i);
      const fld=label=>{const m=text.match(new RegExp('(?:^|\\n)'+label+'\\s+([^\\n\\r]+)','i'));return m?String(m[1]||'').trim():'';};
      city=fld('Ort');
      const request=fld('Anfrage für|Anfrage fuer'),kind=fld('Art der Anfrage'),service=fld('Dienstleistung'),building=fld('Gebäudeart|Gebaeudeart'),sanitary=fld('Sanitäranlagen|Sanitaeranlagen'),water=fld('Wasseranschlüsse vorhanden\\?|Wasseranschluesse vorhanden\\?');
      const note=firstMatch(text,/(?:^|\n)Anmerkungen\s+([\s\S]*?)(?:\n\s*\[Vollständige Anfrage ansehen\]|\n\s*Vollständige Anfrage ansehen|\n\s*Sie können mich)/i);
      externalUrl=String((text.match(/https:\/\/trustlocal\.de\/login-portal\/pro\/messages\/\d+\/\?token=[^\s\])]+/i)||[])[0]||'');
      phoneUrl=String((text.match(/https:\/\/trustlocal\.de\/login-portal\/pro\/messages\/\d+\/(?:telefoonnummer|telefonnummer)\/\?token=[^\s\])]+/i)||[])[0]||'');
      description=[request,kind&&('Art: '+kind),service&&('Dienstleistung: '+service),building&&('Gebäudeart: '+building),sanitary&&('Sanitäranlagen: '+sanitary),water&&('Wasseranschlüsse: '+water),note&&('Anmerkung: '+note)].filter(Boolean).join(' · ').slice(0,3000);
    }else if(/info@aqon-pure\.com/i.test(mail)&&/^Neuer Einbauauftrag f(?:ü|u)r AQON PURE bei /i.test(subject)){
      source='AQON PURE';
      customer=firstMatch(text,/(?:^|\n)Name:\s*([^\n\r]+)/i);
      const street=firstMatch(text,/(?:^|\n)Straße \+ Hausnummer:\s*([^\n\r]+)/i);
      const plzOrt=firstMatch(text,/(?:^|\n)PLZ \+ Ort:\s*([^\n\r]+)/i),loc=plzOrt.match(/^(\d{5})\s+(.+)$/);
      postalCode=String(loc&&loc[1]||'');city=String(loc&&loc[2]||'').trim();
      phone=firstMatch(text,/(?:^|\n)Telefon:\s*([^\n\r]+)/i);email=firstMatch(text,/(?:^|\n)E-Mail:\s*([^\n\r]+)/i);
      const material=firstMatch(text,/(?:^|\n)Rohrmaterial \/ Hersteller:\s*([^\n\r]+)/i),dimension=firstMatch(text,/(?:^|\n)Dimension:\s*([^\n\r]+)/i);
      dropboxUrl=String((text.match(/https:\/\/www\.dropbox\.com\/[^\s]+/i)||[])[0]||'');
      aqonAppointmentUrl=String((text.match(/https:\/\/aqonpure\.wufoo\.com\/forms\/[^\s]+/i)||[])[0]||'');
      let details=firstMatch(text,/Die Kontaktdaten des Kunden lauten:\s*([\s\S]*?)(?:\n\s*Über eine positive Rückmeldung|\n\s*Mit freundlichen Grüßen)/i);
      if(details)details='Die Kontaktdaten des Kunden lauten:\n'+details;aqonDetails=details;
      const billing=firstMatch(text,/Hinweis zur Abrechnung\s*([\s\S]*?)(?:\n\s*Sollten Sie den Einbautermin)/i);
      description=['AQON PURE Einbauauftrag',street&&('Adresse: '+street),plzOrt,material&&('Rohrmaterial: '+material),dimension&&('Dimension: '+dimension),billing&&('Abrechnung: '+billing)].filter(Boolean).join(' · ').slice(0,3000);
    }else{
      const own=/^(kontakt@delgesso\.info|delgessomichael@gmail\.com)$/i.test(mail);
      if(own||!mail||!/kontakt@delgesso\.info/i.test(to))return null;
      if(/(?:no-?reply|noreply|mailer-daemon|postmaster|newsletter)/i.test(mail))return null;
      if(/@(vaillant\.(?:de|com)|gc-gruppe\.de|mail\.verivox\.de)$/i.test(mail))return null;
      const direct=directBody(text),all=(subject+'\n'+direct+'\n'+attNames.join(' ')).toLowerCase();
      const platformHint=/\bmy\s*hammer\b/i.test(subject)?'MyHammer':(/\bblauarbeit\b/i.test(subject)?'Blauarbeit':'');
      const explicitNewWork=/(neue|weiter(?:e|er)|zus(?:ä|a)tzlich(?:e|er)).{0,40}(anfrage|auftrag|arbeit|reparatur|austausch)/i.test(all);
      if(/\b(rechnung(?:_|\b)|lieferschein|gutschrift|mahnung|zahlungserinnerung|kredit|newsletter|rabattaktion|produktzusammenstellung|bewerbung|lebenslauf|kontoauszug|bestellbest(?:ä|a)tigung)\b/i.test(all))return null;
      if(/\b(nachbesserung|rechnungskl(?:ä|a)rung|zahlungserinnerung|angebot\s*(?:nr\.?|nummer)?\s*[0-9-]+.{0,80}(?:nehme|nehmen).{0,20}an|erteile.{0,30}auftrag.{0,60}angebot)\b/i.test(all))return null;
      if(!explicitNewWork&&(
        /^(?:re:|aw:|antwort:)?\s*ihr\s+angebot\b.*\b(?:blauarbeit|my\s*hammer)\b/i.test(subject)||
        /\bangebot\s+angenommen\b/i.test(direct)||
        /\bvielen\s+dank.{0,70}(?:f(?:ü|u)r).{0,50}(?:ihr|das)\s+angebot\b/i.test(direct)
      ))return null;
      const known=await openInquiryByEmail(mail);
      if(known&&/^(re:|aw:|antwort:)/i.test(subject)&&!explicitNewWork)return null;
      const subjectStrong=/\b(anfrage|angebot|reparatur|austausch|erneuerung|defekt|st(?:ö|o)rung|sanit(?:ä|a)r|heizung|klima|w(?:ä|a)rmepumpe|wc|toilette|dusche|bad|wasserhahn|zapfstelle|rohr|abfluss|wartung|montage|installation|therme|warmwasser|heizk(?:ö|o)rper|hauswasserstation|speicher|boiler)\b/i.test(subject);
      const requestPhrase=/\b(k(?:ö|o)nnten sie|k(?:ö|o)nnen sie|ich m(?:ö|o)chte|wir m(?:ö|o)chten|ich ben(?:ö|o)tige|wir ben(?:ö|o)tigen|ich brauche|wir brauchen|bitte um (?:ein )?angebot|bitte um termin|termin vereinbaren|haben sie kapazit(?:ä|a)ten|bitte um r(?:ü|u)ckmeldung|bitte melden|unterst(?:ü|u)tzung|k(?:ö|o)nnen sie sich das ansehen|was w(?:ü|u)rde .* kosten|preis(?:angebot)?|kostenvoranschlag)\b/i.test(all);
      const terms=all.match(/\b(reparatur|austausch|erneuer|defekt|kaputt|undicht|leck|verstopf|st(?:ö|o)rung|sanit(?:ä|a)r|heizung|therme|warmwasser|wasserhahn|zapfstelle|wc|toilette|dusche|bad|heizk(?:ö|o)rper|klimaanlage|klima|w(?:ä|a)rmepumpe|rohr|abfluss|enth(?:ä|a)rt|hauswasserstation|speicher|boiler|fu(?:ß|ss)bodenheizung|wartung|montage|installation|sp(?:ü|u)lkasten|armatur|waschtisch|badewanne)\b/ig)||[];
      let score=Math.min(5,new Set(terms.map(x=>x.toLowerCase())).size);
      if(subjectStrong)score+=3;if(requestPhrase)score+=4;if(/\b(anfrage|angebot|kostenvoranschlag)\b/i.test(subject))score+=2;
      if(/\b(foto|fotos|bild|bilder|anhang|anbei)\b/i.test(all)&&attNames.length)score+=1;
      if(/\b\d{5}\s+[A-Za-zÄÖÜäöüß-]{2,}/.test(direct))score+=1;if(/\+?[0-9][0-9 ()\/-]{6,}/.test(direct))score+=1;
      if(/@(gmail\.com|gmx\.(?:de|net)|t-online\.de|web\.de|outlook\.(?:de|com)|hotmail\.(?:de|com)|mail\.de|kabelmail\.de)$/i.test(mail))score+=1;
      if(known)score+=1;if(/^(re:|aw:|wg:|fwd:)/i.test(subject)&&!known)score-=2;
      if(!(subjectStrong&&requestPhrase)&&score<6)return null;
      source=platformHint||'E-Mail direkt';customer=from.name||mail;email=mail;
      phone=firstMatch(direct,/(?:Telefon|Mobil|Tel\.?|Handy)?[^+0-9]{0,12}(\+?[0-9][0-9 ()\/-]{6,})/i);
      const loc=direct.match(/\b(\d{5})\s+([A-Za-zÄÖÜäöüß\- ]{2,45})(?:[,\.\n]|$)/);postalCode=String(loc&&loc[1]||'');city=String(loc&&loc[2]||'').trim();
      externalUrl=msg.threadId?'https://mail.google.com/mail/u/0/#all/'+String(msg.threadId):'';
      description=direct||subject;if(attNames.length)description+='\n\nAnhang/Anhänge in Gmail: '+attNames.join(', ');
      description=description.slice(0,5000);
    }
    if(!customer)return null;
    if(!email&&source!=='Trustlocal')email=field(text,'E-Mail|Email|Mail')||from.email;
    if(!phone)phone=field(text,'Telefon|Tel\\.?|Mobil|Handy');
    return {source,customer,email,phone,postalCode,city,subject,description,externalUrl,phoneUrl,dropboxUrl,aqonAppointmentUrl,aqonDetails};
  }

  async function findMergeTarget(rec){
    if(!rec)return null;
    const openSql="COALESCE(status,'Neu') NOT IN ('Erledigt','Gelöscht','Übernommen','Archiviert')";
    if(['E-Mail direkt','MyHammer','Blauarbeit'].includes(rec.source)&&rec.email&&/^(re:|aw:|antwort:)/i.test(String(rec.subject||''))){
      const q=await pool.query(`SELECT * FROM customer_inquiries_shadow WHERE lower(COALESCE(email,''))=lower($1) AND ${openSql} ORDER BY received_at_text DESC NULLS LAST LIMIT 1`,[rec.email]);
      if(q.rowCount)return q.rows[0];
    }
    if(rec.source==='CHECK24'&&rec.customer){
      const q=await pool.query(`SELECT * FROM customer_inquiries_shadow WHERE source='CHECK24' AND ${openSql} ORDER BY received_at_text DESC NULLS LAST`);
      const key=inquiryNorm(rec.customer),exact=q.rows.find(r=>inquiryNorm(r.customer)===key&&rec.postalCode&&String(r.postal_code||'')===String(rec.postalCode));
      if(exact)return exact;
      const same=q.rows.filter(r=>inquiryNorm(r.customer)===key);
      if(same.length===1&&(!rec.postalCode||!same[0].postal_code))return same[0];
    }
    return null;
  }
  function mergeAttachments(oldText,newList){
    let a=[];try{a=JSON.parse(String(oldText||'[]'));if(!Array.isArray(a))a=[];}catch(_e){a=[];}
    const seen=new Set(a.map(x=>String(x.messageId||'')+'|'+String(x.attachmentId||'')));
    for(const x of (newList||[])){const k=String(x.messageId||'')+'|'+String(x.attachmentId||'');if(!seen.has(k)){seen.add(k);a.push(x);}}
    return a.slice(0,50);
  }
  async function importMessage(msg,token){
    const id=String(msg.id||'');if(!id)return {ignored:true};
    const seen=await pool.query('SELECT inquiry_id FROM gmail_import_messages_v10 WHERE message_id=$1',[id]);
    if(seen.rowCount)return {duplicate:true,inquiryId:String(seen.rows[0].inquiry_id||'')};
    const h=headers(msg.payload||{}),rec=await parseInquiry(msg),received=new Date(Number(msg.internalDate)||Date.now()).toISOString();
    const att=rec?await persistInquiryAttachments(token,msg):[];
    if(!rec){
      await pool.query('INSERT INTO gmail_import_messages_v10(message_id,thread_id,sender,subject,received_at_text) VALUES($1,$2,$3,$4,$5) ON CONFLICT(message_id) DO NOTHING',[id,String(msg.threadId||''),String(h.from||''),String(h.subject||''),received]);
      return {ignored:true};
    }
    const target=await findMergeTarget(rec);
    if(target){
      const ids=[...new Set(String(target.gmail_ids||'').split('|').filter(Boolean).concat(id))].join('|');
      let desc=String(target.description||'');if(rec.description&&!desc.includes(rec.description))desc=[desc,rec.description].filter(Boolean).join(' / ').slice(0,8000);
      const at=mergeAttachments(target.attachments_json,att);
      await pool.query(
        `UPDATE customer_inquiries_shadow SET gmail_ids=$2,
          email=CASE WHEN COALESCE(email,'')='' THEN $3 ELSE email END,
          phone=CASE WHEN COALESCE(phone,'')='' THEN $4 ELSE phone END,
          postal_code=CASE WHEN COALESCE(postal_code,'')='' THEN $5 ELSE postal_code END,
          city=CASE WHEN COALESCE(city,'')='' THEN $6 ELSE city END,
          description=$7,
          external_url=CASE WHEN COALESCE(external_url,'')='' THEN $8 ELSE external_url END,
          phone_url=CASE WHEN COALESCE(phone_url,'')='' THEN $9 ELSE phone_url END,
          dropbox_url=CASE WHEN COALESCE(dropbox_url,'')='' THEN $10 ELSE dropbox_url END,
          aqon_appointment_url=CASE WHEN COALESCE(aqon_appointment_url,'')='' THEN $11 ELSE aqon_appointment_url END,
          aqon_details=CASE WHEN COALESCE(aqon_details,'')='' THEN $12 ELSE aqon_details END,
          attachments_json=$13,changed_at_text=$14,changed_by='Gmail Railway',shadow_updated_at=now()
        WHERE id=$1`,
        [String(target.id),ids,rec.email||'',rec.phone||'',rec.postalCode||'',rec.city||'',desc,rec.externalUrl||'',rec.phoneUrl||'',rec.dropboxUrl||'',rec.aqonAppointmentUrl||'',rec.aqonDetails||'',JSON.stringify(at),received]
      );
      await pool.query('INSERT INTO gmail_import_messages_v10(message_id,thread_id,inquiry_id,sender,subject,received_at_text) VALUES($1,$2,$3,$4,$5,$6)',[id,String(msg.threadId||''),String(target.id),String(h.from||''),rec.subject,received]);
      return {updated:true,inquiryId:String(target.id),source:rec.source};
    }
    const inquiryId='GM-INQ-'+crypto.randomUUID();
    await pool.query(
      `INSERT INTO customer_inquiries_shadow(
        id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,
        created_at_text,changed_at_text,changed_by,attachments_json,external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Neu',false,$11,$11,'Gmail Railway',$12,$13,$14,$15,$16,$17,now())`,
      [inquiryId,rec.source,id,rec.customer,rec.email||'',rec.phone||'',rec.postalCode||'',rec.city||'',rec.subject,rec.description||'',received,JSON.stringify(att),rec.externalUrl||'',rec.phoneUrl||'',rec.dropboxUrl||'',rec.aqonAppointmentUrl||'',rec.aqonDetails||'']
    );
    await pool.query('INSERT INTO gmail_import_messages_v10(message_id,thread_id,inquiry_id,sender,subject,received_at_text) VALUES($1,$2,$3,$4,$5,$6)',[id,String(msg.threadId||''),inquiryId,String(h.from||''),rec.subject,received]);
    return {imported:true,inquiryId,source:rec.source};
  }


  const FINANCE_LABEL='AAA - Erhaltene Rechnungen';
  const TAX_LABEL='Steuerberaterin Frau Busse';
  const TAX_MAIL='kontakt@buchhaltung-busse.de';
  const financeLabelCache=new Map();

  function hasModifyScope(r){
    const s=String(r&&r.scope||'');
    return s.includes('https://www.googleapis.com/auth/gmail.modify')||s.includes('https://mail.google.com/');
  }
  function financeKind(msg){
    const h=headers(msg&&msg.payload||{}),from=sender(h.from),mail=String(from.email||'').toLowerCase();
    if(mail===TAX_MAIL)return 'tax';
    const subject=String(h.subject||'').trim();
    const names=attachmentNames(msg&&msg.payload||{},msg&&msg.id||'');
    // Allgemeiner Rechnungseingang: echte Beleg-/Rechnungsindikatoren.
    // Reine Kundenkorrespondenz wie "Klärung der Rechnung" darf nicht einsortiert werden.
    const subjectInvoice=/^(?:re(?:\s*:)?\s*)?(?:rechnung(?:\s|$|[-_#:/])|invoice(?:\s|$|[-_#:/])|gutschrift(?:\s|$|[-_#:/])|mahnung(?:\s|$|[-_#:/])|zahlungserinnerung(?:\s|$|[-_#:/])|honorarrechnung(?:\s|$|[-_#:/])|beleg(?:\s|$|[-_#:/]))/i.test(subject);
    const attachmentInvoice=names.some(name=>/(?:^|[\\s_\\-])(rechnung|invoice|gutschrift|mahnung|zahlungserinnerung|honorarrechnung|beleg)(?:[\\s_.\\-]|$)/i.test(String(name||'')));
    return (subjectInvoice||attachmentInvoice)?'incoming':'';
  }
  async function gmailLabels(token){
    const x=await api(token,'labels');
    return Array.isArray(x.labels)?x.labels:[];
  }
  async function ensureLabel(token,name){
    const cacheKey=String(name||'');
    if(financeLabelCache.has(cacheKey))return financeLabelCache.get(cacheKey);
    const labels=await gmailLabels(token);
    const hit=labels.find(x=>String(x.name||'')===cacheKey);
    if(hit){
      const id=String(hit.id||'');
      if(id)financeLabelCache.set(cacheKey,id);
      return id;
    }
    const made=await apiJson(token,'POST','labels',{name:cacheKey,labelListVisibility:'labelShow',messageListVisibility:'show'});
    const id=String(made.id||'');
    if(id)financeLabelCache.set(cacheKey,id);
    return id;
  }
  async function moveToFinanceLabel(token,messageId,labelName){
    const labelId=await ensureLabel(token,labelName);
    if(!labelId)throw new Error('Gmail-Label konnte nicht erstellt werden: '+labelName);
    await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/modify',{addLabelIds:[labelId],removeLabelIds:['INBOX']});
    return labelId;
  }
  function financeRow(r){
    let attachments=[];try{attachments=JSON.parse(String(r.attachments_json||'[]'));if(!Array.isArray(attachments))attachments=[];}catch(_e){attachments=[];}
    const provider=String(r.provider||'gmail').toLowerCase();
    return {
      messageId:String(r.message_id||''),threadId:String(r.thread_id||''),senderEmail:String(r.sender_email||''),
      senderName:String(r.sender_name||''),subject:String(r.subject||''),receivedAt:String(r.received_at_text||''),
      category:String(r.category||''),status:String(r.status||''),paidAt:String(r.paid_at_text||''),
      archivedAt:String(r.archived_at_text||''),attachments,gmailLabel:String(r.gmail_label||''),provider,
      gmailUrl:provider==='gmail'?'https://mail.google.com/mail/u/0/#all/'+encodeURIComponent(String(r.message_id||'')):''
    };
  }
  async function storeFinanceMessage(token,msg,kind,labelName){
    const h=headers(msg.payload||{}),from=sender(h.from),received=new Date(Number(msg.internalDate)||Date.now()).toISOString();
    const att=await persistFinanceAttachments(token,msg);
    await pool.query(
      `INSERT INTO finance_mail_v10(message_id,thread_id,sender_email,sender_name,subject,received_at_text,category,status,attachments_json,gmail_label,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,now())
       ON CONFLICT(message_id) DO UPDATE SET
         thread_id=EXCLUDED.thread_id,sender_email=EXCLUDED.sender_email,sender_name=EXCLUDED.sender_name,
         subject=EXCLUDED.subject,received_at_text=EXCLUDED.received_at_text,
         category=CASE WHEN finance_mail_v10.status='open' THEN EXCLUDED.category ELSE finance_mail_v10.category END,
         attachments_json=CASE WHEN EXCLUDED.attachments_json<>'[]' THEN EXCLUDED.attachments_json ELSE finance_mail_v10.attachments_json END,
         gmail_label=EXCLUDED.gmail_label,updated_at=now()`,
      [String(msg.id||''),String(msg.threadId||''),String(from.email||''),String(from.name||''),String(h.subject||''),
       received,kind,JSON.stringify(att),labelName]
    );
  }
  async function syncFinance(){
    if(!configured())return {ok:true,configured:false,connected:false,needsConfiguration:true,redirectUri};
    const r=await row();if(!r)return {ok:true,configured:true,connected:false,needsConnect:true,redirectUri};
    const canModify=hasModifyScope(r);
    // Nur echte Rechnungs-/Steuerberater-Kandidaten aus Gmail laden. Der alte Vollscan
    // des gesamten Posteingangs konnte beim ersten Lauf Googles Minutenquota ausloesen.
    const token=await accessToken();
    const query='in:inbox -category:promotions -category:social {from:'+TAX_MAIL+
      ' subject:rechnung subject:invoice subject:gutschrift subject:mahnung subject:zahlungserinnerung'+
      ' subject:honorarrechnung subject:beleg filename:rechnung filename:invoice filename:gutschrift'+
      ' filename:mahnung filename:zahlungserinnerung filename:honorarrechnung filename:beleg}';
    let pageToken='',ids=[];
    for(let page=0;page<3;page++){
      const q=new URLSearchParams({q:query,maxResults:'100'});if(pageToken)q.set('pageToken',pageToken);
      const list=await api(token,'messages?'+q.toString());
      ids.push(...(list.messages||[]).map(x=>String(x.id||'')).filter(Boolean));
      pageToken=String(list.nextPageToken||'');if(!pageToken)break;
    }
    ids=[...new Set(ids)];
    let imported=0,tax=0,ignored=0,failed=0,moved=0,moveFailed=0;
    for(const id of ids){
      try{
        const known=await pool.query('SELECT status,category FROM finance_mail_v10 WHERE message_id=$1 LIMIT 1',[id]);
        if(known.rowCount){
          // Bereits importierte Mails nach einer später erteilten Modify-Freigabe nachträglich
          // aus dem Gmail-Posteingang verschieben.
          if(canModify&&String(known.rows[0].status||'')==='open'){
            const category=String(known.rows[0].category||'');
            const label=category==='tax'?TAX_LABEL:category==='incoming'?FINANCE_LABEL:'';
            if(label){
              try{await moveToFinanceLabel(token,id,label);moved++;}catch(e){moveFailed++;console.error('FINANCE_GMAIL move known message='+id+' error='+e.message);}
            }
          }
          ignored++;continue;
        }
        const msg=await api(token,'messages/'+encodeURIComponent(id)+'?format=full');
        const kind=financeKind(msg);if(!kind){ignored++;continue;}
        const label=kind==='tax'?TAX_LABEL:FINANCE_LABEL;

        // Der Import selbst braucht nur Gmail-Lesezugriff.
        await storeFinanceMessage(token,msg,kind,label);
        if(canModify){
          try{await moveToFinanceLabel(token,id,label);moved++;}catch(e){moveFailed++;console.error('FINANCE_GMAIL move message='+id+' error='+e.message);}
        }
        if(kind==='tax')tax++;else imported++;
      }catch(e){failed++;console.error('FINANCE_GMAIL message='+id+' error='+e.message);}
    }
    const attachmentBackfill=await backfillFinanceAttachments(token);
    const summary={at:new Date().toISOString(),scanned:ids.length,imported,tax,ignored,failed,moved,moveFailed,
      modifyAuthorized:canModify,needsReconnect:!canModify,
      attachmentBackfillUpdated:Number(attachmentBackfill.updated||0),attachmentBackfillFailed:Number(attachmentBackfill.failed||0)};
    await pool.query(`INSERT INTO app_meta(key,value) VALUES('finance_mail_last_sync_v10',$1::jsonb)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(summary)]);
    console.log('FINANCE_GMAIL_SYNC '+JSON.stringify(summary));
    return Object.assign({ok:true,configured:true,connected:true,email:String(r.account_email||''),scope:String(r.scope||'')},summary);
  }
  async function financeSyncForUser(actor){
    const r=await syncFinance();
    if(r.needsConnect||r.needsReconnect)r.authUrl=await authUrl(actor);
    return r;
  }
  async function financeList(category,status){
    const q=await pool.query(
      `SELECT * FROM finance_mail_v10 WHERE category=$1 AND status=$2 ORDER BY received_at_text DESC NULLS LAST,updated_at DESC LIMIT 500`,
      [String(category),String(status)]
    );
    return q.rows.map(financeRow);
  }
  async function financeOverview(){
    const q=await pool.query(
      `SELECT
        COUNT(*) FILTER(WHERE category='incoming' AND status='open')::int AS incoming,
        COUNT(*) FILTER(WHERE category='tax' AND status='open')::int AS tax
       FROM finance_mail_v10`
    );
    const r=q.rows[0]||{};
    const s=await row();
    return {incoming:Number(r.incoming||0),tax:Number(r.tax||0),modifyAuthorized:hasModifyScope(s),connected:Boolean(s)};
  }
  async function financeArchive(kind,year,month){
    year=Number(year||0);month=Number(month||0);
    let status=kind==='tax'?'tax_archived':'paid';
    const dateExpr=status==='paid'?'paid_at_text':'archived_at_text';
    const vals=[status],where=['status=$1'];
    if(year>0){vals.push(String(year));where.push(`substring(COALESCE(${dateExpr},received_at_text),1,4)=\$${vals.length}`);}
    if(month>0){vals.push(String(month).padStart(2,'0'));where.push(`substring(COALESCE(${dateExpr},received_at_text),6,2)=\$${vals.length}`);}
    const q=await pool.query('SELECT * FROM finance_mail_v10 WHERE '+where.join(' AND ')+' ORDER BY COALESCE('+dateExpr+',received_at_text) DESC LIMIT 1000',vals);
    return q.rows.map(financeRow);
  }
  async function markPaid(messageId,actor,fromTax){
    messageId=String(messageId||'').trim();if(!messageId)throw new Error('E-Mail fehlt.');
    const now=new Date().toISOString();
    const q=await pool.query(
      `UPDATE finance_mail_v10 SET status='paid',paid_at_text=$2,archived_at_text=NULL,updated_at=now()
        WHERE message_id=$1 RETURNING *`,[messageId,now]
    );
    if(!q.rowCount)throw new Error('E-Mail wurde nicht gefunden.');
    if(fromTax){
      const r=await row();
      if(hasModifyScope(r)){
        try{const token=await accessToken();const labelId=await ensureLabel(token,FINANCE_LABEL);if(labelId)await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/modify',{addLabelIds:[labelId]});}catch(e){console.error('FINANCE_GMAIL add invoice label failed',e.message);}
      }
    }
    await pool.query(`INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ['finance_last_action_v10',JSON.stringify({action:fromTax?'tax_as_invoice':'paid',messageId,actor:String(actor||''),at:now})]);
    return financeRow(q.rows[0]);
  }
  async function archiveTax(messageId,actor){
    messageId=String(messageId||'').trim();if(!messageId)throw new Error('E-Mail fehlt.');
    const now=new Date().toISOString();
    const q=await pool.query(
      `UPDATE finance_mail_v10 SET status='tax_archived',archived_at_text=$2,updated_at=now()
        WHERE message_id=$1 AND category='tax' RETURNING *`,[messageId,now]
    );
    if(!q.rowCount)throw new Error('Steuerberater-Mail wurde nicht gefunden.');
    await pool.query(`INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ['finance_last_action_v10',JSON.stringify({action:'tax_archive',messageId,actor:String(actor||''),at:now})]);
    return financeRow(q.rows[0]);
  }

  async function deleteFinanceMail(messageId,actor){
    messageId=String(messageId||'').trim();if(!messageId)throw new Error('E-Mail fehlt.');
    const q=await pool.query('SELECT attachments_json FROM finance_mail_v10 WHERE message_id=$1 LIMIT 1',[messageId]);
    if(!q.rowCount)throw new Error('E-Mail wurde in der App nicht gefunden.');
    const oauth=await row();
    if(!oauth||!hasModifyScope(oauth)){
      const e=new Error('Google-Freigabe zum Löschen fehlt. Bitte Gmail-Verbindung aktualisieren.');
      e.needsReconnect=true;
      throw e;
    }
    const token=await accessToken();
    // Gmail-Nachricht in den Papierkorb verschieben. Sie verschwindet aus Posteingang/Labels,
    // bleibt dort aber gemäß Gmail-Aufbewahrung noch wiederherstellbar.
    await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/trash');

    let attachments=[];try{attachments=JSON.parse(String(q.rows[0].attachments_json||'[]'));if(!Array.isArray(attachments))attachments=[];}catch(_e){attachments=[];}
    const fileIds=[...new Set(attachments.map(x=>String(x&&x.fileId||'').trim()).filter(Boolean))];
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
      if(fileIds.length){
        await client.query("DELETE FROM binary_files_v10 WHERE id=ANY($1::text[]) AND source='gmail-finance'",[fileIds]);
      }
      await client.query(
        `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
        ['finance_last_action_v10',JSON.stringify({action:'delete_mail',messageId,actor:String(actor||''),fileIds,at:new Date().toISOString()})]
      );
      await client.query('COMMIT');
    }catch(e){
      try{await client.query('ROLLBACK');}catch(_e){}
      throw e;
    }finally{client.release();}
    return {ok:true,messageId,deleted:true,trashedInGmail:true,deletedFiles:fileIds.length};
  }

  async function markSpam(messageId,actor){
    messageId=String(messageId||'').trim();if(!messageId)throw new Error('E-Mail fehlt.');
    const q=await pool.query('SELECT attachments_json FROM finance_mail_v10 WHERE message_id=$1 LIMIT 1',[messageId]);
    if(!q.rowCount)throw new Error('E-Mail wurde in der App nicht gefunden.');
    const oauth=await row();
    if(!oauth||!hasModifyScope(oauth)){
      const e=new Error('Google-Freigabe zum Markieren als Spam fehlt. Bitte Gmail-Verbindung aktualisieren.');
      e.needsReconnect=true;throw e;
    }
    const token=await accessToken();
    const finId=await ensureLabel(token,FINANCE_LABEL),taxId=await ensureLabel(token,TAX_LABEL);
    await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/modify',{
      addLabelIds:['SPAM'],removeLabelIds:[...new Set(['INBOX',finId,taxId].filter(Boolean))]
    });

    let attachments=[];try{attachments=JSON.parse(String(q.rows[0].attachments_json||'[]'));if(!Array.isArray(attachments))attachments=[];}catch(_e){attachments=[];}
    const fileIds=[...new Set(attachments.map(x=>String(x&&x.fileId||'').trim()).filter(Boolean))];
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
      if(fileIds.length)await client.query("DELETE FROM binary_files_v10 WHERE id=ANY($1::text[]) AND source='gmail-finance'",[fileIds]);
      await client.query(
        `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
        ['finance_last_action_v10',JSON.stringify({action:'spam',messageId,actor:String(actor||''),fileIds,at:new Date().toISOString()})]
      );
      await client.query('COMMIT');
    }catch(e){try{await client.query('ROLLBACK');}catch(_e){}throw e;}finally{client.release();}
    return {ok:true,messageId,spam:true,removedFromApp:true,deletedFiles:fileIds.length};
  }

  async function moveFinanceMail(messageId,target,actor){
    messageId=String(messageId||'').trim();target=String(target||'').trim();
    if(!messageId)throw new Error('E-Mail fehlt.');
    if(!['inquiries','incoming','tax'].includes(target))throw new Error('Ungültiger Zielordner.');
    const q=await pool.query('SELECT * FROM finance_mail_v10 WHERE message_id=$1 LIMIT 1',[messageId]);
    if(!q.rowCount)throw new Error('E-Mail wurde in der App nicht gefunden.');
    const current=q.rows[0],oauth=await row();
    if(!oauth||!hasModifyScope(oauth)){
      const e=new Error('Google-Freigabe zum Verschieben fehlt. Bitte Gmail-Verbindung aktualisieren.');
      e.needsReconnect=true;throw e;
    }
    const token=await accessToken();
    const msg=await api(token,'messages/'+encodeURIComponent(messageId)+'?format=full');

    if(target==='inquiries'){
      const rec=await parseInquiry(msg);
      const h=headers(msg.payload||{}),received=new Date(Number(msg.internalDate)||Date.now()).toISOString();
      const att=await persistInquiryAttachments(token,msg);
      let inquiryId='',source='E-Mail direkt';
      if(rec){
        source=rec.source||source;
        const existing=await findMergeTarget(rec);
        if(existing){
          inquiryId=String(existing.id||'');
          const ids=[...new Set(String(existing.gmail_ids||'').split('|').filter(Boolean).concat(messageId))].join('|');
          let desc=String(existing.description||'');if(rec.description&&!desc.includes(rec.description))desc=[desc,rec.description].filter(Boolean).join(' / ').slice(0,8000);
          const merged=mergeAttachments(existing.attachments_json,att);
          await pool.query(
            `UPDATE customer_inquiries_shadow SET gmail_ids=$2,
              email=CASE WHEN COALESCE(email,'')='' THEN $3 ELSE email END,
              phone=CASE WHEN COALESCE(phone,'')='' THEN $4 ELSE phone END,
              postal_code=CASE WHEN COALESCE(postal_code,'')='' THEN $5 ELSE postal_code END,
              city=CASE WHEN COALESCE(city,'')='' THEN $6 ELSE city END,
              description=$7,attachments_json=$8,changed_at_text=$9,changed_by=$10,shadow_updated_at=now()
              WHERE id=$1`,
            [inquiryId,ids,rec.email||'',rec.phone||'',rec.postalCode||'',rec.city||'',desc,JSON.stringify(merged),received,String(actor||'')]
          );
        }else{
          inquiryId='GM-INQ-'+crypto.randomUUID();
          await pool.query(
            `INSERT INTO customer_inquiries_shadow(
              id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,
              created_at_text,changed_at_text,changed_by,attachments_json,external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,shadow_updated_at
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Neu',false,$11,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
            [inquiryId,rec.source||source,messageId,rec.customer||current.sender_name||current.sender_email||'E-Mail',rec.email||current.sender_email||'',
             rec.phone||'',rec.postalCode||'',rec.city||'',rec.subject||current.subject||'',rec.description||current.subject||'',received,
             String(actor||''),JSON.stringify(att),rec.externalUrl||'',rec.phoneUrl||'',rec.dropboxUrl||'',rec.aqonAppointmentUrl||'',rec.aqonDetails||'']
          );
        }
      }else{
        inquiryId='GM-INQ-'+crypto.randomUUID();
        const h2=headers(msg.payload||{}),from=sender(h2.from),text=bodyText(msg.payload||{}).slice(0,5000);
        await pool.query(
          `INSERT INTO customer_inquiries_shadow(
            id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,
            created_at_text,changed_at_text,changed_by,attachments_json,shadow_updated_at
          ) VALUES($1,'E-Mail direkt',$2,$3,$4,'','','',$5,$6,$7,'Neu',false,$7,$7,$8,$9,now())`,
          [inquiryId,messageId,String(from.name||from.email||'E-Mail'),String(from.email||''),String(h2.subject||current.subject||''),text||String(current.subject||''),received,String(actor||''),JSON.stringify(att)]
        );
      }
      await pool.query(
        `INSERT INTO gmail_import_messages_v10(message_id,thread_id,inquiry_id,sender,subject,received_at_text)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(message_id) DO UPDATE SET inquiry_id=EXCLUDED.inquiry_id,thread_id=EXCLUDED.thread_id,sender=EXCLUDED.sender,subject=EXCLUDED.subject,received_at_text=EXCLUDED.received_at_text`,
        [messageId,String(msg.threadId||''),inquiryId,String(h.from||''),String(h.subject||current.subject||''),received]
      );
      const finId=await ensureLabel(token,FINANCE_LABEL),taxId=await ensureLabel(token,TAX_LABEL);
      await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/modify',{
        removeLabelIds:[...new Set(['INBOX',finId,taxId].filter(Boolean))]
      });
      let oldFinanceAttachments=[];try{oldFinanceAttachments=JSON.parse(String(current.attachments_json||'[]'));if(!Array.isArray(oldFinanceAttachments))oldFinanceAttachments=[];}catch(_e){oldFinanceAttachments=[];}
      const oldFinanceFileIds=[...new Set(oldFinanceAttachments.map(x=>String(x&&x.fileId||'').trim()).filter(Boolean))];
      await pool.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
      if(oldFinanceFileIds.length)await pool.query("DELETE FROM binary_files_v10 WHERE id=ANY($1::text[]) AND source='gmail-finance'",[oldFinanceFileIds]);
      return {ok:true,messageId,target,inquiryId,source};
    }

    const category=target==='tax'?'tax':'incoming';
    const label=target==='tax'?TAX_LABEL:FINANCE_LABEL;
    const labelId=await ensureLabel(token,label);
    const removeLabels=['INBOX'];
    if(target==='incoming'){const taxId=await ensureLabel(token,TAX_LABEL);if(taxId)removeLabels.push(taxId);}
    else {const finId=await ensureLabel(token,FINANCE_LABEL);if(finId)removeLabels.push(finId);}
    await apiJson(token,'POST','messages/'+encodeURIComponent(messageId)+'/modify',{addLabelIds:[labelId],removeLabelIds:[...new Set(removeLabels)]});
    await pool.query(
      `UPDATE finance_mail_v10 SET category=$2,status='open',gmail_label=$3,paid_at_text=NULL,archived_at_text=NULL,updated_at=now() WHERE message_id=$1`,
      [messageId,category,label]
    );
    await pool.query(
      `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ['finance_last_action_v10',JSON.stringify({action:'move_mail',messageId,target,actor:String(actor||''),at:new Date().toISOString()})]
    );
    return {ok:true,messageId,target};
  }


  async function archiveInquiryMessages(inquiryId,actor){
    inquiryId=String(inquiryId||'').trim();if(!inquiryId)return {ok:true,archived:0,messageIds:[]};
    const q=await pool.query('SELECT gmail_ids FROM customer_inquiries_shadow WHERE id=$1 LIMIT 1',[inquiryId]);
    if(!q.rowCount)return {ok:true,archived:0,messageIds:[]};
    const ids=[...new Set(String(q.rows[0].gmail_ids||'').split('|').map(x=>x.trim()).filter(Boolean))];
    if(!ids.length)return {ok:true,archived:0,messageIds:[]};
    const oauth=await row();
    if(!oauth||!hasModifyScope(oauth))return {ok:false,archived:0,messageIds:ids,needsReconnect:true};
    const token=await accessToken();let archived=0,failed=0;
    for(const id of ids){
      try{
        await apiJson(token,'POST','messages/'+encodeURIComponent(id)+'/modify',{removeLabelIds:['INBOX']});
        archived++;
      }catch(e){failed++;console.error('GMAIL_INQUIRY_ARCHIVE inquiry='+inquiryId+' message='+id+' error='+e.message);}
    }
    await pool.query(
      `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ['gmail_inquiry_archive:'+inquiryId,JSON.stringify({inquiryId,actor:String(actor||''),messageIds:ids,archived,failed,at:new Date().toISOString()})]
    );
    return {ok:failed===0,archived,failed,messageIds:ids};
  }

  async function sync(){
    if(syncing)return {ok:true,skipped:true,reason:'busy'};
    if(!configured())return {ok:true,configured:false,connected:false,needsConfiguration:true,redirectUri};
    const r=await row();if(!r)return {ok:true,configured:true,connected:false,needsConnect:true,redirectUri};
    syncing=true;
    try{
      const token=await accessToken(),canModify=hasModifyScope(r),query='in:inbox newer_than:30d -category:promotions -category:social';
      let pageToken='',ids=[];
      // Maximal die 200 neuesten Inbox-Mails pro Lauf betrachten. Weitere Mails
      // werden in den naechsten 20-Minuten-Laeufen nachgezogen, statt Googles
      // Minutenquota mit einem Vollscan zu ueberfahren.
      for(let page=0;page<2;page++){
        const q=new URLSearchParams({q:query,maxResults:'100'});if(pageToken)q.set('pageToken',pageToken);
        const list=await api(token,'messages?'+q.toString());
        ids.push(...(list.messages||[]).map(x=>String(x.id||'')).filter(Boolean));
        pageToken=String(list.nextPageToken||'');if(!pageToken)break;
      }
      ids=[...new Set(ids)];
      let known=new Set(),knownInquiryIds=[];
      if(ids.length){
        const kq=await pool.query('SELECT message_id,inquiry_id FROM gmail_import_messages_v10 WHERE message_id=ANY($1::text[])',[ids]);
        known=new Set(kq.rows.map(x=>String(x.message_id||'')));
        knownInquiryIds=kq.rows.filter(x=>String(x.inquiry_id||'').trim()).map(x=>String(x.message_id||''));
      }
      let archived=0,archiveFailed=0;
      if(canModify&&knownInquiryIds.length){
        for(const id of knownInquiryIds){
          try{await apiJson(token,'POST','messages/'+encodeURIComponent(id)+'/modify',{removeLabelIds:['INBOX']});archived++;}
          catch(e){archiveFailed++;console.error('GMAIL_INQUIRY_RECONCILE message='+id+' error='+e.message);}
        }
      }
      const pendingAll=ids.filter(id=>!known.has(id));
      // Pro Lauf hoechstens 50 neue Mails voll laden (inkl. Anhaengen).
      // So bleiben manuelle und automatische Synchronisation reaktionsschnell.
      const pending=pendingAll.slice(0,50);
      let imported=0,updated=0,ignored=0,duplicates=known.size,failed=0;const sources={};
      for(const id of pending){
        try{
          const msg=await api(token,'messages/'+encodeURIComponent(id)+'?format=full'),x=await importMessage(msg,token);
          if(x.imported){imported++;sources[x.source]=(sources[x.source]||0)+1;}
          else if(x.updated){updated++;sources[x.source]=(sources[x.source]||0)+1;}
          else if(x.duplicate)duplicates++;else ignored++;
          if(canModify&&(x.imported||x.updated||x.duplicate)&&String(x.inquiryId||'').trim()){
            try{await apiJson(token,'POST','messages/'+encodeURIComponent(id)+'/modify',{removeLabelIds:['INBOX']});archived++;}
            catch(e){archiveFailed++;console.error('GMAIL_INQUIRY_ARCHIVE_AFTER_IMPORT message='+id+' error='+e.message);}
          }
        }catch(e){failed++;console.error('GMAIL_IMPORT message='+id+' error='+e.message);}
      }
      const inquiryAttachmentBackfill=await backfillInquiryAttachments(token);
      const summary={at:new Date().toISOString(),scanned:ids.length,pending:pending.length,deferred:Math.max(0,pendingAll.length-pending.length),imported,updated,ignored,duplicates,failed,sources,
        archivedFromInbox:archived,archiveFailed,modifyAuthorized:canModify,needsReconnect:!canModify,
        attachmentBackfillUpdated:Number(inquiryAttachmentBackfill.updated||0),
        attachmentBackfillFailed:Number(inquiryAttachmentBackfill.failed||0)};
      await pool.query(`INSERT INTO app_meta(key,value) VALUES('gmail_last_sync_v10',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(summary)]);
      return Object.assign({ok:true,configured:true,connected:true,email:String(r.account_email||'')},summary);
    }finally{syncing=false;}
  }

  async function status(){
    const r=await row(); let last=null;
    const q=await pool.query("SELECT value,updated_at FROM app_meta WHERE key='gmail_last_sync_v10' LIMIT 1");
    if(q.rowCount) last=Object.assign({},q.rows[0].value||{},{updatedAt:q.rows[0].updated_at});
    return {configured:configured(),connected:Boolean(r),email:String(r&&r.account_email||''),scope:String(r&&r.scope||''),modifyAuthorized:hasModifyScope(r),calendarAuthorized:Boolean(r&&String(r.scope||'').includes('https://www.googleapis.com/auth/calendar')),redirectUri,lastSync:last};
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
    setImmediate(async()=>{
      for(const job of [sync,syncFinance]){
        try{await job();}catch(e){console.error('GMAIL first sync failed',e&&e.message||e);}
      }
    });
    return {ok:true,email:account};
  }

  async function syncForUser(actor){
    const r=await sync();
    if(r.needsConnect||r.needsReconnect) r.authUrl=await authUrl(actor);
    return r;
  }

  async function scheduledSync(){
    // Gmail-Pfade bewusst nacheinander ausfuehren, damit Anfrage- und
    // Rechnungssynchronisation nicht gleichzeitig dieselbe User-Quota belasten.
    for(const job of [sync,syncFinance]){
      try{await job();}catch(e){console.error('GMAIL scheduled sync failed',e&&e.message||e);}
    }
  }
  function start(){
    if(timer||!pool) return;
    timer=setInterval(()=>scheduledSync().catch(e=>console.error('GMAIL scheduled sync failed',e.message)),intervalMs);
    if(timer.unref) timer.unref();
    setTimeout(()=>scheduledSync().catch(e=>console.error('GMAIL startup sync failed',e.message)),15000);
  }

  return {init,start,status,syncForUser,financeSyncForUser,financeList,financeOverview,financeArchive,markPaid,archiveTax,deleteFinanceMail,markSpam,moveFinanceMail,archiveInquiryMessages,callback,authUrl,configured,calendarApi,googleConnection,accessToken};
}

module.exports={createGmailDirect};
