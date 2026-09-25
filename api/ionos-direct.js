'use strict';

const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function createIonosDirect(opts){
  const pool = opts.pool;
  const apiOrigin = String(opts.apiOrigin || '').replace(/\/$/, '');
  const host = String(process.env.IONOS_IMAP_HOST || 'imap.ionos.de').trim();
  const port = Number(process.env.IONOS_IMAP_PORT || 993);
  const secure = !/^(0|false|no|nein)$/i.test(String(process.env.IONOS_IMAP_SECURE || 'true'));
  const user = String(process.env.IONOS_IMAP_USER || 'kontakt@delgesso.info').trim();
  const pass = String(process.env.IONOS_IMAP_PASSWORD || '');
  const intervalMs = Math.max(5 * 60 * 1000, Number(process.env.IONOS_SYNC_INTERVAL_MS) || Number(process.env.GMAIL_SYNC_INTERVAL_MS) || 20 * 60 * 1000);
  const sinceText = String(process.env.IONOS_IMPORT_SINCE || '2026-09-25T19:15:00+02:00').trim();
  const sinceMs = Number.isFinite(Date.parse(sinceText)) ? Date.parse(sinceText) : Date.parse('2026-09-25T19:15:00+02:00');
  const account = user.toLowerCase();
  let syncing = false, timer = null;

  const FINANCE_FOLDER = 'DG - Rechnungen';
  const TAX_FOLDER = 'DG - Steuerberater Frau Busse';
  const ARCHIVE_FOLDER = 'DG - Archivierte Anfragen';
  const TAX_MAIL = 'kontakt@buchhaltung-busse.de';

  function configured(){ return Boolean(pool && host && user && pass); }
  function fileUrl(id){ return id ? apiOrigin + '/v1/files/' + encodeURIComponent(id) : ''; }
  function norm(v){
    return String(v || '').trim().toLowerCase().replace(/ß/g, 'ss').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function firstMatch(text, rx){
    const m = String(text || '').match(rx);
    return m ? String(m[1] || '').trim() : '';
  }
  function field(text, rx){
    const m = String(text || '').match(new RegExp('(?:^|\\n)\\s*(?:' + rx + ')\\s*[:=-]\\s*([^\\n\\r]+)', 'i'));
    return m ? String(m[1] || '').trim() : '';
  }
  function directBody(text){
    let body = String(text || '').replace(/\r/g, '').trim();
    body = body.split(/\n(?:Von:|From:|-----Original Message-----|-----Urspr(?:ü|u)ngliche Nachricht-----|Am .{0,120} schrieb:)/i)[0].trim();
    return body.length > 5000 ? body.slice(0, 5000) : body;
  }
  function mailAddress(parsed, key){
    const obj = parsed && parsed[key];
    const value = obj && Array.isArray(obj.value) ? obj.value[0] : null;
    const email = String(value && value.address || '').trim().toLowerCase();
    const name = String(value && value.name || '').trim() || email;
    return { email, name };
  }
  function recipients(parsed){
    const all = [];
    for(const key of ['to','cc']){
      const obj = parsed && parsed[key];
      for(const v of (obj && Array.isArray(obj.value) ? obj.value : [])){
        const e = String(v && v.address || '').trim().toLowerCase();
        if(e) all.push(e);
      }
    }
    return all.join(',');
  }
  function textBody(parsed){
    const t = String(parsed && parsed.text || '').replace(/\r/g, '').trim();
    if(t) return t;
    let h = parsed && parsed.html;
    if(Buffer.isBuffer(h)) h = h.toString('utf8');
    h = String(h || '');
    return h.replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
  function attachmentNames(parsed){
    return (parsed && Array.isArray(parsed.attachments) ? parsed.attachments : []).map(x => String(x.filename || '')).filter(Boolean);
  }
  function stableId(uid, messageId, receivedAt){
    const raw = [account, String(uid || ''), String(messageId || ''), String(receivedAt || '')].join('|');
    return 'ionos:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40);
  }
  function contentHash(from, subject, text, names){
    return crypto.createHash('sha256').update([
      String(from || '').trim().toLowerCase(),
      norm(subject),
      norm(String(text || '').slice(0, 6000)),
      (names || []).map(norm).sort().join('|')
    ].join('\n')).digest('hex');
  }

  async function init(){
    if(!pool) return;
    await pool.query(
      "CREATE TABLE IF NOT EXISTS external_mail_import_v10(" +
      " provider TEXT NOT NULL, provider_ref TEXT NOT NULL, rfc_message_id TEXT, content_hash TEXT," +
      " inquiry_id TEXT, finance_message_id TEXT, classification TEXT, received_at_text TEXT," +
      " imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(provider,provider_ref));" +
      "CREATE INDEX IF NOT EXISTS external_mail_import_v10_hash_idx ON external_mail_import_v10(content_hash,received_at_text);" +
      "ALTER TABLE customer_inquiries_shadow ADD COLUMN IF NOT EXISTS mail_refs_json TEXT;" +
      "ALTER TABLE finance_mail_v10 ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gmail';" +
      "ALTER TABLE finance_mail_v10 ADD COLUMN IF NOT EXISTS provider_mailbox TEXT;" +
      "ALTER TABLE finance_mail_v10 ADD COLUMN IF NOT EXISTS provider_uid BIGINT;" +
      "ALTER TABLE finance_mail_v10 ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;" +
      "ALTER TABLE finance_mail_v10 ADD COLUMN IF NOT EXISTS body_text TEXT;"
    );
  }

  function client(){
    const c = new ImapFlow({
      host, port, secure,
      auth:{ user, pass },
      logger:false,
      emitLogs:false,
      disableAutoIdle:true
    });
    c.on('error', e => console.error('IONOS_IMAP error=' + String(e && e.message || e)));
    return c;
  }

  async function folderState(c){
    let list = await c.list();
    const bySpecial = special => list.find(x => String(x.specialUse || '') === special);
    const byName = name => list.find(x => String(x.path || '').toLowerCase() === String(name).toLowerCase());
    async function ensure(name){
      let x = byName(name);
      if(x) return x.path;
      try{ await c.mailboxCreate(name); }catch(e){
        if(!/exist/i.test(String(e && e.message || e))) throw e;
      }
      list = await c.list();
      x = byName(name);
      return x ? x.path : name;
    }
    return {
      archive: bySpecial('\\Archive') ? bySpecial('\\Archive').path : await ensure(ARCHIVE_FOLDER),
      junk: bySpecial('\\Junk') ? bySpecial('\\Junk').path : await ensure('Spam'),
      trash: bySpecial('\\Trash') ? bySpecial('\\Trash').path : await ensure('Papierkorb'),
      finance: await ensure(FINANCE_FOLDER),
      tax: await ensure(TAX_FOLDER)
    };
  }

  function movedUid(result, oldUid){
    try{
      if(result && result.uidMap && typeof result.uidMap.get === 'function'){
        return Number(result.uidMap.get(Number(oldUid)) || result.uidMap.get(String(oldUid)) || 0);
      }
    }catch(_e){}
    return 0;
  }

  async function moveInOpenMailbox(c, uid, destination){
    const r = await c.messageMove(String(uid), destination, { uid:true });
    return { mailbox:destination, uid:movedUid(r, uid) };
  }

  async function moveStoredMessage(row, destination){
    if(!configured()) throw new Error('IONOS-Postfach ist noch nicht vollständig konfiguriert.');
    const source = String(row && row.provider_mailbox || '').trim();
    const uid = Number(row && row.provider_uid || 0);
    if(!source || !uid) throw new Error('IONOS-Nachricht kann im Postfach nicht mehr eindeutig zugeordnet werden.');
    const c = client();
    await c.connect();
    try{
      const lock = await c.getMailboxLock(source);
      try{
        const r = await c.messageMove(String(uid), destination, {uid:true});
        return {mailbox:destination, uid:movedUid(r, uid)};
      }finally{ lock.release(); }
    }finally{
      try{ await c.logout(); }catch(_e){}
    }
  }

  async function parseInquiry(parsed){
    const from = mailAddress(parsed, 'from'), to = recipients(parsed), subject = String(parsed.subject || '').trim();
    const raw = textBody(parsed), text = raw.length > 7000 ? raw.slice(0,7000) : raw;
    const mail = from.email, attNames = attachmentNames(parsed);
    let source='',customer='',email='',phone='',postalCode='',city='',description='',externalUrl='',phoneUrl='',dropboxUrl='',aqonAppointmentUrl='',aqonDetails='';

    if(/kontakt@delgesso\.info/i.test(mail) && /^(Anfrage:|Kontaktanfrage)/i.test(subject)){
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
      description=direct||subject;if(attNames.length)description+='\n\nAnhang/Anhänge im IONOS-Postfach: '+attNames.join(', ');
      description=description.slice(0,5000);
    }
    if(!customer)return null;
    if(!email&&source!=='Trustlocal')email=field(text,'E-Mail|Email|Mail')||from.email;
    if(!phone)phone=field(text,'Telefon|Tel\\.?|Mobil|Handy');
    return {source,customer,email,phone,postalCode,city,subject,description,externalUrl,phoneUrl,dropboxUrl,aqonAppointmentUrl,aqonDetails};
  }

  function financeKind(parsed){
    const from=mailAddress(parsed,'from'),mail=from.email;
    if(mail===TAX_MAIL)return 'tax';
    const subject=String(parsed.subject||'').trim(),names=attachmentNames(parsed);
    const subjectInvoice=/^(?:re(?:\s*:)?\s*)?(?:rechnung(?:\s|$|[-_#:/])|invoice(?:\s|$|[-_#:/])|gutschrift(?:\s|$|[-_#:/])|mahnung(?:\s|$|[-_#:/])|zahlungserinnerung(?:\s|$|[-_#:/])|honorarrechnung(?:\s|$|[-_#:/])|beleg(?:\s|$|[-_#:/]))/i.test(subject);
    const attachmentInvoice=names.some(name=>/(?:^|[\s_\-])(rechnung|invoice|gutschrift|mahnung|zahlungserinnerung|honorarrechnung|beleg)(?:[\s_.\-]|$)/i.test(String(name||'')));
    return subjectInvoice||attachmentInvoice?'incoming':'';
  }

  async function openInquiryByEmail(email){
    email=String(email||'').trim().toLowerCase();if(!email)return null;
    const q=await pool.query(
      "SELECT * FROM customer_inquiries_shadow WHERE lower(COALESCE(email,''))=lower($1)" +
      " AND COALESCE(status,'Neu') NOT IN ('Erledigt','Gelöscht','Übernommen','Archiviert')" +
      " ORDER BY received_at_text DESC NULLS LAST LIMIT 1",[email]);
    return q.rows[0]||null;
  }

  async function findMergeTarget(rec){
    if(!rec)return null;
    const openSql="COALESCE(status,'Neu') NOT IN ('Erledigt','Gelöscht','Übernommen','Archiviert')";
    if(['E-Mail direkt','MyHammer','Blauarbeit'].includes(rec.source)&&rec.email&&/^(re:|aw:|antwort:)/i.test(String(rec.subject||''))){
      const q=await pool.query("SELECT * FROM customer_inquiries_shadow WHERE lower(COALESCE(email,''))=lower($1) AND "+openSql+" ORDER BY received_at_text DESC NULLS LAST LIMIT 1",[rec.email]);
      if(q.rowCount)return q.rows[0];
    }
    if(rec.source==='CHECK24'&&rec.customer){
      const q=await pool.query("SELECT * FROM customer_inquiries_shadow WHERE source='CHECK24' AND "+openSql+" ORDER BY received_at_text DESC NULLS LAST");
      const key=norm(rec.customer),exact=q.rows.find(r=>norm(r.customer)===key&&rec.postalCode&&String(r.postal_code||'')===String(rec.postalCode));
      if(exact)return exact;
      const same=q.rows.filter(r=>norm(r.customer)===key);
      if(same.length===1&&(!rec.postalCode||!same[0].postal_code))return same[0];
    }
    return null;
  }

  async function crossInquiryDuplicate(rec, receivedAt, hash){
    const vals=[hash], where=["content_hash=$1","inquiry_id IS NOT NULL"];
    const q0=await pool.query("SELECT inquiry_id,received_at_text FROM external_mail_import_v10 WHERE "+where.join(' AND ')+" ORDER BY imported_at DESC LIMIT 20",vals);
    for(const r of q0.rows){
      const a=Date.parse(String(r.received_at_text||'')), b=Date.parse(receivedAt);
      if(Number.isFinite(a)&&Math.abs(a-b)<=30*60*1000){
        const q=await pool.query('SELECT * FROM customer_inquiries_shadow WHERE id=$1 LIMIT 1',[String(r.inquiry_id||'')]);
        if(q.rowCount)return q.rows[0];
      }
    }
    if(!rec.email||!rec.subject)return null;
    const q=await pool.query(
      "SELECT * FROM customer_inquiries_shadow WHERE lower(COALESCE(email,''))=lower($1) AND lower(COALESCE(subject,''))=lower($2) ORDER BY received_at_text DESC NULLS LAST LIMIT 20",
      [rec.email,rec.subject]);
    for(const r of q.rows){
      const a=Date.parse(String(r.received_at_text||'')), b=Date.parse(receivedAt);
      if(Number.isFinite(a)&&Math.abs(a-b)<=15*60*1000)return r;
    }
    return null;
  }

  async function crossFinanceDuplicate(from, subject, receivedAt){
    const q=await pool.query(
      "SELECT message_id,received_at_text FROM finance_mail_v10 WHERE lower(COALESCE(sender_email,''))=lower($1) AND lower(COALESCE(subject,''))=lower($2) ORDER BY received_at_text DESC NULLS LAST LIMIT 20",
      [from,subject]);
    for(const r of q.rows){
      const a=Date.parse(String(r.received_at_text||'')), b=Date.parse(receivedAt);
      if(Number.isFinite(a)&&Math.abs(a-b)<=15*60*1000)return String(r.message_id||'');
    }
    return '';
  }

  function mergeAttachments(oldText,newList){
    let a=[];try{a=JSON.parse(String(oldText||'[]'));if(!Array.isArray(a))a=[];}catch(_e){a=[];}
    const seen=new Set(a.map(x=>String(x.fileId||'')+'|'+String(x.messageId||'')+'|'+String(x.attachmentId||'')));
    for(const x of (newList||[])){
      const k=String(x.fileId||'')+'|'+String(x.messageId||'')+'|'+String(x.attachmentId||'');
      if(!seen.has(k)){seen.add(k);a.push(x);}
    }
    return a.slice(0,50);
  }

  function mergeRefs(oldText, ref){
    let a=[];try{a=JSON.parse(String(oldText||'[]'));if(!Array.isArray(a))a=[];}catch(_e){a=[];}
    const key=String(ref.provider||'')+'|'+String(ref.mailbox||'')+'|'+String(ref.uid||'')+'|'+String(ref.messageId||'');
    if(!a.some(x=>String(x.provider||'')+'|'+String(x.mailbox||'')+'|'+String(x.uid||'')+'|'+String(x.messageId||'')===key))a.push(ref);
    return a.slice(-50);
  }

  async function storeAttachments(parsed, mailId, kind){
    const stored=[];
    const list=parsed&&Array.isArray(parsed.attachments)?parsed.attachments:[];
    for(let i=0;i<list.length&&i<30;i++){
      const a=list[i]||{}, data=Buffer.isBuffer(a.content)?a.content:Buffer.from(a.content||'');
      const name=String(a.filename||('Anhang-'+(i+1))),mime=String(a.contentType||'application/octet-stream');
      if(!data.length)continue;
      if(data.length>25*1024*1024){stored.push({messageId:mailId,attachmentId:String(i+1),name,mime,size:data.length,tooLarge:true,source:'IONOS'});continue;}
      const id=(kind==='finance'?'IONOSFIN-':'IONOSINQ-')+crypto.createHash('sha256').update(mailId+'|'+i+'|'+name+'|').update(data).digest('hex').slice(0,40);
      const sha=crypto.createHash('sha256').update(data).digest('hex'), source=kind==='finance'?'ionos-finance':'ionos-inquiry';
      await pool.query(
        "INSERT INTO binary_files_v10(id,file_name,mime_type,file_size,sha256,file_data,source,kind,metadata,updated_at)" +
        " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())" +
        " ON CONFLICT(id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_size=EXCLUDED.file_size," +
        " sha256=EXCLUDED.sha256,file_data=EXCLUDED.file_data,source=EXCLUDED.source,kind=EXCLUDED.kind,metadata=EXCLUDED.metadata,updated_at=now()",
        [id,name,mime,data.length,sha,data,source,kind==='finance'?'invoice-attachment':'inquiry-attachment',JSON.stringify({provider:'ionos',messageId:mailId,index:i})]
      );
      stored.push({fileId:id,messageId:mailId,attachmentId:String(i+1),name,mime,size:data.length,url:fileUrl(id),source:'IONOS'});
    }
    return stored;
  }

  async function saveTracking(ref, data){
    await pool.query(
      "INSERT INTO external_mail_import_v10(provider,provider_ref,rfc_message_id,content_hash,inquiry_id,finance_message_id,classification,received_at_text)" +
      " VALUES('ionos',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider,provider_ref) DO UPDATE SET" +
      " rfc_message_id=EXCLUDED.rfc_message_id,content_hash=EXCLUDED.content_hash,inquiry_id=EXCLUDED.inquiry_id," +
      " finance_message_id=EXCLUDED.finance_message_id,classification=EXCLUDED.classification,received_at_text=EXCLUDED.received_at_text",
      [ref,String(data.rfcMessageId||''),String(data.hash||''),String(data.inquiryId||''),String(data.financeMessageId||''),String(data.classification||''),String(data.receivedAt||'')]
    );
  }

  async function importInquiry(parsed, meta, rec, refObj){
    const existing=await crossInquiryDuplicate(rec,meta.receivedAt,meta.hash)||await findMergeTarget(rec);
    let inquiryId='',updated=false,duplicate=false;
    if(existing){
      inquiryId=String(existing.id||'');
      const duplicateExact=Boolean(await crossInquiryDuplicate(rec,meta.receivedAt,meta.hash));
      duplicate=duplicateExact;
      if(!duplicateExact){
        const files=await storeAttachments(parsed,meta.mailId,'inquiry');
        const refs=mergeRefs(existing.mail_refs_json,refObj);
        const merged=mergeAttachments(existing.attachments_json,files);
        let desc=String(existing.description||'');if(rec.description&&!desc.includes(rec.description))desc=[desc,rec.description].filter(Boolean).join(' / ').slice(0,8000);
        await pool.query(
          "UPDATE customer_inquiries_shadow SET email=CASE WHEN COALESCE(email,'')='' THEN $2 ELSE email END," +
          " phone=CASE WHEN COALESCE(phone,'')='' THEN $3 ELSE phone END,postal_code=CASE WHEN COALESCE(postal_code,'')='' THEN $4 ELSE postal_code END," +
          " city=CASE WHEN COALESCE(city,'')='' THEN $5 ELSE city END,description=$6,attachments_json=$7,mail_refs_json=$8," +
          " changed_at_text=$9,changed_by='IONOS Railway',shadow_updated_at=now() WHERE id=$1",
          [inquiryId,rec.email||'',rec.phone||'',rec.postalCode||'',rec.city||'',desc,JSON.stringify(merged),JSON.stringify(refs),meta.receivedAt]
        );
        updated=true;
      }else{
        const refs=mergeRefs(existing.mail_refs_json,refObj);
        await pool.query("UPDATE customer_inquiries_shadow SET mail_refs_json=$2,shadow_updated_at=now() WHERE id=$1",[inquiryId,JSON.stringify(refs)]);
      }
    }else{
      const files=await storeAttachments(parsed,meta.mailId,'inquiry');
      inquiryId='IONOS-INQ-'+crypto.randomUUID();
      await pool.query(
        "INSERT INTO customer_inquiries_shadow(id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag," +
        " created_at_text,changed_at_text,changed_by,attachments_json,mail_refs_json,external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,shadow_updated_at)" +
        " VALUES($1,$2,'',$3,$4,$5,$6,$7,$8,$9,$10,'Neu',false,$10,$10,'IONOS Railway',$11,$12,$13,$14,$15,$16,$17,now())",
        [inquiryId,rec.source,rec.customer,rec.email||'',rec.phone||'',rec.postalCode||'',rec.city||'',rec.subject,rec.description||'',meta.receivedAt,
         JSON.stringify(files),JSON.stringify([refObj]),rec.externalUrl||'',rec.phoneUrl||'',rec.dropboxUrl||'',rec.aqonAppointmentUrl||'',rec.aqonDetails||'']
      );
    }
    return {inquiryId,updated,duplicate,imported:!existing};
  }

  async function updateInquiryMailRef(inquiryId, mailId, patch){
    const q=await pool.query('SELECT mail_refs_json FROM customer_inquiries_shadow WHERE id=$1 LIMIT 1',[String(inquiryId||'')]);
    if(!q.rowCount)return;
    const refs=parseJsonList(q.rows[0].mail_refs_json);
    let changed=false;
    for(const r of refs){
      if(String(r&&r.provider||'')==='ionos'&&String(r&&r.messageId||'')===String(mailId||'')){
        Object.assign(r,patch||{});changed=true;
      }
    }
    if(changed)await pool.query('UPDATE customer_inquiries_shadow SET mail_refs_json=$2,shadow_updated_at=now() WHERE id=$1',
      [String(inquiryId||''),JSON.stringify(refs)]);
  }

  async function importFinance(parsed, meta, kind, mailbox, uid){
    const from=mailAddress(parsed,'from'),subject=String(parsed.subject||''),dupe=await crossFinanceDuplicate(from.email,subject,meta.receivedAt);
    if(dupe)return {duplicate:true,financeMessageId:dupe};
    const files=await storeAttachments(parsed,meta.mailId,'finance');
    await pool.query(
      "INSERT INTO finance_mail_v10(message_id,thread_id,sender_email,sender_name,subject,received_at_text,category,status,attachments_json,gmail_label," +
      " provider,provider_mailbox,provider_uid,rfc_message_id,body_text,updated_at)" +
      " VALUES($1,'',$2,$3,$4,$5,$6,'open',$7,'',$8,$9,$10,$11,$12,now())" +
      " ON CONFLICT(message_id) DO UPDATE SET provider_mailbox=EXCLUDED.provider_mailbox,provider_uid=EXCLUDED.provider_uid,updated_at=now()",
      [meta.mailId,from.email,from.name,subject,meta.receivedAt,kind,JSON.stringify(files),'ionos',mailbox,uid,String(meta.rfcMessageId||''),textBody(parsed).slice(0,10000)]
    );
    return {duplicate:false,financeMessageId:meta.mailId};
  }

  async function syncAll(){
    if(syncing)return {ok:true,skipped:true,reason:'busy'};
    if(!configured())return {ok:true,configured:false,connected:false,needsConfiguration:true,email:user,host,importSince:sinceText};
    syncing=true;
    const summary={at:new Date().toISOString(),configured:true,connected:false,email:user,host,importSince:sinceText,scanned:0,
      inquiryImported:0,inquiryUpdated:0,inquiryDuplicates:0,financeImported:0,tax:0,financeDuplicates:0,ignored:0,failed:0,archived:0,moveFailed:0};
    const c=client();
    try{
      await c.connect();
      summary.connected=true;
      const folders=await folderState(c);
      const lock=await c.getMailboxLock('INBOX');
      try{
        const searchDate=new Date(sinceMs - 24*60*60*1000);
        let uids=await c.search({since:searchDate},{uid:true});
        uids=(uids||[]).map(Number).filter(Boolean).slice(-200);
        const knownQ=uids.length?await pool.query("SELECT provider_ref FROM external_mail_import_v10 WHERE provider='ionos' AND provider_ref=ANY($1::text[])",[uids.map(String)]):{rows:[]};
        const known=new Set((knownQ.rows||[]).map(x=>String(x.provider_ref||'')));
        const pending=uids.filter(uid=>!known.has(String(uid))).slice(-80);
        if(pending.length){
          const messages=await c.fetchAll(pending,{uid:true,source:true,internalDate:true,envelope:true},{uid:true});
          for(const msg of messages){
            const uid=Number(msg.uid||0),providerRef=String(uid);
            try{
              const parsed=await simpleParser(msg.source||Buffer.alloc(0),{skipHtmlToText:false,skipTextToHtml:true});
              const receivedDate=msg.internalDate instanceof Date?msg.internalDate:(parsed.date instanceof Date?parsed.date:new Date());
              const receivedMs=receivedDate.getTime();
              if(Number.isFinite(receivedMs)&&receivedMs<sinceMs){
                await saveTracking(providerRef,{rfcMessageId:parsed.messageId||'',hash:'',classification:'before-cutoff',receivedAt:receivedDate.toISOString()});
                continue;
              }
              summary.scanned++;
              const receivedAt=receivedDate.toISOString(),from=mailAddress(parsed,'from'),subject=String(parsed.subject||''),text=textBody(parsed),names=attachmentNames(parsed);
              const hash=contentHash(from.email,subject,text,names),mailId=stableId(uid,parsed.messageId,receivedAt);
              const meta={mailId,rfcMessageId:String(parsed.messageId||''),receivedAt,hash};
              const kind=financeKind(parsed);
              if(kind){
                const dest=kind==='tax'?folders.tax:folders.finance;
                // Zuerst sicher in PostgreSQL speichern, erst danach aus dem IONOS-Posteingang verschieben.
                // So geht bei einem DB-Fehler keine Mail aus dem produktiven Eingang verloren.
                const fin=await importFinance(parsed,meta,kind,'INBOX',uid);
                if(fin.duplicate)summary.financeDuplicates++;
                else if(kind==='tax')summary.tax++;else summary.financeImported++;
                try{
                  const moved=await moveInOpenMailbox(c,uid,dest);
                  if(!fin.duplicate){
                    await pool.query("UPDATE finance_mail_v10 SET provider_mailbox=$2,provider_uid=$3,updated_at=now() WHERE message_id=$1 AND provider='ionos'",
                      [fin.financeMessageId,moved.mailbox,Number(moved.uid||0)]);
                  }
                }catch(e){summary.moveFailed++;throw e;}
                await saveTracking(providerRef,{...meta,financeMessageId:fin.financeMessageId,classification:kind});
                continue;
              }
              const rec=await parseInquiry(parsed);
              if(rec){
                const refObj={provider:'ionos',messageId:mailId,mailbox:'INBOX',uid,rfcMessageId:meta.rfcMessageId};
                const x=await importInquiry(parsed,meta,rec,refObj);
                if(x.duplicate)summary.inquiryDuplicates++;else if(x.updated)summary.inquiryUpdated++;else if(x.imported)summary.inquiryImported++;
                try{
                  const moved=await moveInOpenMailbox(c,uid,folders.archive);
                  await updateInquiryMailRef(x.inquiryId,mailId,{mailbox:moved.mailbox,uid:Number(moved.uid||0)});
                  summary.archived++;
                }catch(e){summary.moveFailed++;throw e;}
                await saveTracking(providerRef,{...meta,inquiryId:x.inquiryId,classification:'inquiry'});
                continue;
              }
              summary.ignored++;
              await saveTracking(providerRef,{...meta,classification:'ignored'});
            }catch(e){
              summary.failed++;
              console.error('IONOS_IMPORT uid='+uid+' error='+String(e&&e.message||e));
            }
          }
        }
      }finally{lock.release();}
      await pool.query(
        "INSERT INTO app_meta(key,value) VALUES('ionos_last_sync_v10',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [JSON.stringify(summary)]
      );
      console.log('IONOS_MAIL_SYNC '+JSON.stringify(summary));
      return Object.assign({ok:true},summary);
    }catch(e){
      summary.failed++;
      summary.connected=false;
      summary.error=String(e&&e.message||e);
      try{
        await pool.query("INSERT INTO app_meta(key,value) VALUES('ionos_last_sync_v10',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[JSON.stringify(summary)]);
      }catch(_e){}
      console.error('IONOS_MAIL_SYNC failed '+summary.error);
      return Object.assign({ok:false},summary);
    }finally{
      try{await c.logout();}catch(_e){}
      syncing=false;
    }
  }

  async function status(){
    let last=null;
    if(pool){
      const q=await pool.query("SELECT value,updated_at FROM app_meta WHERE key='ionos_last_sync_v10' LIMIT 1");
      if(q.rowCount)last=Object.assign({},q.rows[0].value||{},{updatedAt:q.rows[0].updated_at});
    }
    return {configured:configured(),connected:Boolean(last&&last.connected),email:user,host,port,secure,importSince:sinceText,lastSync:last};
  }

  async function syncForUser(){ return syncAll(); }

  async function financeRow(messageId){
    const q=await pool.query("SELECT * FROM finance_mail_v10 WHERE message_id=$1 AND provider='ionos' LIMIT 1",[String(messageId||'')]);
    if(!q.rowCount)throw new Error('IONOS-E-Mail wurde in der App nicht gefunden.');
    return q.rows[0];
  }
  function parseJsonList(v){let a=[];try{a=JSON.parse(String(v||'[]'));if(!Array.isArray(a))a=[];}catch(_e){a=[];}return a;}
  async function deleteFiles(row){
    const ids=[...new Set(parseJsonList(row.attachments_json).map(x=>String(x&&x.fileId||'').trim()).filter(Boolean))];
    if(ids.length)await pool.query("DELETE FROM binary_files_v10 WHERE id=ANY($1::text[]) AND source IN ('ionos-finance','ionos-inquiry')",[ids]);
    return ids.length;
  }

  async function markPaid(messageId,actor,fromTax){
    const row=await financeRow(messageId),now=new Date().toISOString();
    const q=await pool.query("UPDATE finance_mail_v10 SET status='paid',paid_at_text=$2,archived_at_text=NULL,updated_at=now() WHERE message_id=$1 RETURNING *",[messageId,now]);
    await pool.query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      ['finance_last_action_v10',JSON.stringify({action:fromTax?'ionos_tax_as_invoice':'ionos_paid',messageId,actor:String(actor||''),at:now})]);
    return q.rows[0]||row;
  }

  async function archiveTax(messageId,actor){
    const row=await financeRow(messageId),now=new Date().toISOString();
    const q=await pool.query("UPDATE finance_mail_v10 SET status='tax_archived',archived_at_text=$2,updated_at=now() WHERE message_id=$1 AND category='tax' RETURNING *",[messageId,now]);
    if(!q.rowCount)throw new Error('Steuerberater-Mail wurde nicht gefunden.');
    await pool.query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      ['finance_last_action_v10',JSON.stringify({action:'ionos_tax_archive',messageId,actor:String(actor||''),at:now})]);
    return q.rows[0]||row;
  }

  async function deleteFinanceMail(messageId,actor){
    const row=await financeRow(messageId);
    const c=client();await c.connect();
    try{
      const folders=await folderState(c),source=String(row.provider_mailbox||''),uid=Number(row.provider_uid||0);
      if(!source||!uid)throw new Error('IONOS-Nachricht kann im Postfach nicht mehr eindeutig zugeordnet werden.');
      const lock=await c.getMailboxLock(source);
      try{await c.messageMove(String(uid),folders.trash,{uid:true});}finally{lock.release();}
    }finally{try{await c.logout();}catch(_e){}}
    const deletedFiles=await deleteFiles(row);
    await pool.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
    await pool.query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      ['finance_last_action_v10',JSON.stringify({action:'ionos_delete_mail',messageId,actor:String(actor||''),at:new Date().toISOString()})]);
    return {ok:true,messageId,deleted:true,trashedInIonos:true,deletedFiles};
  }

  async function markSpam(messageId,actor){
    const row=await financeRow(messageId);
    const c=client();await c.connect();
    try{
      const folders=await folderState(c),source=String(row.provider_mailbox||''),uid=Number(row.provider_uid||0);
      if(!source||!uid)throw new Error('IONOS-Nachricht kann im Postfach nicht mehr eindeutig zugeordnet werden.');
      const lock=await c.getMailboxLock(source);
      try{await c.messageMove(String(uid),folders.junk,{uid:true});}finally{lock.release();}
    }finally{try{await c.logout();}catch(_e){}}
    const deletedFiles=await deleteFiles(row);
    await pool.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
    await pool.query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      ['finance_last_action_v10',JSON.stringify({action:'ionos_spam',messageId,actor:String(actor||''),at:new Date().toISOString()})]);
    return {ok:true,messageId,spam:true,removedFromApp:true,deletedFiles};
  }

  async function moveFinanceMail(messageId,target,actor){
    target=String(target||'').trim();
    if(!['inquiries','incoming','tax'].includes(target))throw new Error('Ungültiger Zielordner.');
    const row=await financeRow(messageId);
    if(target==='inquiries'){
      const now=String(row.received_at_text||new Date().toISOString()),from=String(row.sender_email||''),name=String(row.sender_name||from),subject=String(row.subject||''),body=String(row.body_text||subject);
      const rec={source:'E-Mail direkt',customer:name,email:from,phone:'',postalCode:'',city:'',subject,description:body,externalUrl:'',phoneUrl:'',dropboxUrl:'',aqonAppointmentUrl:'',aqonDetails:''};
      const existing=await findMergeTarget(rec);
      const files=parseJsonList(row.attachments_json);
      let inquiryId='';
      if(existing){
        inquiryId=String(existing.id||'');
        await pool.query("UPDATE binary_files_v10 SET source='ionos-inquiry',kind='inquiry-attachment',updated_at=now() WHERE id=ANY($1::text[])",[files.map(x=>String(x.fileId||'')).filter(Boolean)]);
        await pool.query("UPDATE customer_inquiries_shadow SET attachments_json=$2,description=$3,changed_at_text=$4,changed_by=$5,shadow_updated_at=now() WHERE id=$1",
          [inquiryId,JSON.stringify(mergeAttachments(existing.attachments_json,files)),[String(existing.description||''),body].filter(Boolean).join(' / ').slice(0,8000),now,String(actor||'')]);
      }else{
        inquiryId='IONOS-INQ-'+crypto.randomUUID();
        await pool.query("UPDATE binary_files_v10 SET source='ionos-inquiry',kind='inquiry-attachment',updated_at=now() WHERE id=ANY($1::text[])",[files.map(x=>String(x.fileId||'')).filter(Boolean)]);
        await pool.query(
          "INSERT INTO customer_inquiries_shadow(id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,created_at_text,changed_at_text,changed_by,attachments_json,shadow_updated_at)" +
          " VALUES($1,'E-Mail direkt','',$2,$3,'','','',$4,$5,$6,'Neu',false,$6,$6,$7,$8,now())",
          [inquiryId,name,from,subject,body,now,String(actor||''),JSON.stringify(files)]
        );
      }
      const c=client();await c.connect();
      try{
        const folders=await folderState(c),source=String(row.provider_mailbox||''),uid=Number(row.provider_uid||0);
        if(source&&uid){const lock=await c.getMailboxLock(source);try{await c.messageMove(String(uid),folders.archive,{uid:true});}finally{lock.release();}}
      }finally{try{await c.logout();}catch(_e){}}
      await pool.query('DELETE FROM finance_mail_v10 WHERE message_id=$1',[messageId]);
      return {ok:true,messageId,target,inquiryId,source:'E-Mail direkt'};
    }
    const c=client();await c.connect();
    let moved;
    try{
      const folders=await folderState(c),dest=target==='tax'?folders.tax:folders.finance,source=String(row.provider_mailbox||''),uid=Number(row.provider_uid||0);
      if(!source||!uid)throw new Error('IONOS-Nachricht kann im Postfach nicht mehr eindeutig zugeordnet werden.');
      const lock=await c.getMailboxLock(source);
      try{moved=await moveInOpenMailbox(c,uid,dest);}finally{lock.release();}
    }finally{try{await c.logout();}catch(_e){}}
    const category=target==='tax'?'tax':'incoming';
    await pool.query("UPDATE finance_mail_v10 SET category=$2,status='open',provider_mailbox=$3,provider_uid=$4,paid_at_text=NULL,archived_at_text=NULL,updated_at=now() WHERE message_id=$1",
      [messageId,category,moved.mailbox,Number(moved.uid||0)]);
    return {ok:true,messageId,target};
  }

  async function archiveInquiryMessages(inquiryId,actor){
    inquiryId=String(inquiryId||'').trim();if(!inquiryId)return {ok:true,archived:0};
    const q=await pool.query('SELECT mail_refs_json FROM customer_inquiries_shadow WHERE id=$1 LIMIT 1',[inquiryId]);
    if(!q.rowCount)return {ok:true,archived:0};
    const refs=parseJsonList(q.rows[0].mail_refs_json).filter(x=>String(x&&x.provider||'')==='ionos');
    if(!refs.length)return {ok:true,archived:0};
    if(!configured())return {ok:false,archived:0,needsConfiguration:true};
    let archived=0,failed=0;
    const c=client();await c.connect();
    try{
      const folders=await folderState(c);
      for(const ref of refs){
        const source=String(ref.mailbox||''),uid=Number(ref.uid||0);
        if(!source||!uid||source===folders.archive){archived++;continue;}
        try{
          const lock=await c.getMailboxLock(source);
          try{
            const moved=await moveInOpenMailbox(c,uid,folders.archive);
            ref.mailbox=moved.mailbox;ref.uid=Number(moved.uid||0);
          }finally{lock.release();}
          archived++;
        }catch(e){failed++;console.error('IONOS_INQUIRY_ARCHIVE inquiry='+inquiryId+' error='+String(e&&e.message||e));}
      }
    }finally{try{await c.logout();}catch(_e){}}
    await pool.query('UPDATE customer_inquiries_shadow SET mail_refs_json=$2,shadow_updated_at=now() WHERE id=$1',[inquiryId,JSON.stringify(refs)]);
    await pool.query("INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
      ['ionos_inquiry_archive:'+inquiryId,JSON.stringify({inquiryId,actor:String(actor||''),archived,failed,at:new Date().toISOString()})]);
    return {ok:failed===0,archived,failed};
  }

  function start(){
    if(timer||!pool)return;
    timer=setInterval(()=>syncAll().catch(e=>console.error('IONOS scheduled sync failed',String(e&&e.message||e))),intervalMs);
    if(timer.unref)timer.unref();
    setTimeout(()=>syncAll().catch(e=>console.error('IONOS startup sync failed',String(e&&e.message||e))),25000);
  }

  return {init,start,status,syncForUser,syncAll,markPaid,archiveTax,deleteFinanceMail,markSpam,moveFinanceMail,archiveInquiryMessages,configured};
}

module.exports={createIonosDirect};
