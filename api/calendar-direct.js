'use strict';

const crypto=require('crypto');

function createCalendarDirect(opts){
  const pool=opts.pool;
  const google=opts.google;
  let timer=null,flushing=false;

  function j(v,fallback){
    if(v&&typeof v==='object')return v;
    try{return JSON.parse(String(v||''))||fallback;}catch(_e){return fallback;}
  }
  async function init(){
    if(!pool)return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_sync_queue_v10(
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        event_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS calendar_sync_queue_v10_status_idx
        ON calendar_sync_queue_v10(status,next_attempt_at);
    `);
  }
  async function connection(){
    try{return await google.googleConnection();}catch(_e){return {configured:false,connected:false,scope:''};}
  }
  async function authorized(){
    const c=await connection();
    return Boolean(c.connected&&String(c.scope||'').includes('https://www.googleapis.com/auth/calendar'));
  }
  function offsetFor(date,time){
    const guess=new Date(String(date)+'T'+String(time||'12:00')+':00Z');
    const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Berlin',timeZoneName:'longOffset',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(guess);
    const z=String((p.find(x=>x.type==='timeZoneName')||{}).value||'GMT+01:00').replace(/^GMT/,'');
    return /^[+-]\d{2}:\d{2}$/.test(z)?z:'+01:00';
  }
  function dt(date,time){return String(date)+'T'+String(time)+':00'+offsetFor(date,time);}
  function fmtDateTime(value){
    const d=new Date(value);if(Number.isNaN(d.getTime()))return {date:'',time:''};
    const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
    const g=t=>String((p.find(x=>x.type===t)||{}).value||'');
    return {date:g('year')+'-'+g('month')+'-'+g('day'),time:g('hour')+':'+g('minute')};
  }
  function title(ev){return String(ev.event_type||'')==='Wartung'?'🔧 WARTUNG · '+String(ev.customer||''):String(ev.customer||'');}
  function description(ev){
    const type=String(ev.event_type||'')==='Wartung'?'Wartung':'Auftrag';
    let d='Terminart: '+type+'\nWas ist zu tun:\n'+String(ev.task||'').replace(/^\[WARTUNG\]\s*/i,'')+'\n\nDG-Termin-ID: '+String(ev.id||'');
    if(type==='Wartung'){
      if(ev.maintenance_customer_id)d+='\nWartung-Kunden-ID: '+ev.maintenance_customer_id;
      if(ev.maintenance_object_id)d+='\nWartung-Objekt-ID: '+ev.maintenance_object_id;
      if(ev.maintenance_device_id)d+='\nWartung-Geraet-ID: '+ev.maintenance_device_id;
    }
    return d;
  }
  function taskFromDescription(d){
    return String(d||'')
      .replace(/(?:^|\n)Terminart:\s*(?:Wartung|Auftrag)\s*/gi,'\n')
      .replace(/\n?DG-Termin-ID:\s*[^\n]+/gi,'')
      .replace(/\n?Wartung-(?:Kunden|Objekt|Geraet)-ID:\s*[^\n]+/gi,'')
      .replace(/(?:^|\n)Was ist zu tun:\s*/gi,'\n')
      .replace(/^\s+|\s+$/g,'');
  }
  function typeFromDescription(d){return /(?:^|\n)Terminart:\s*Wartung(?:\n|$)/i.test(String(d||''))?'Wartung':'Auftrag';}
  function marker(d){const m=String(d||'').match(/DG-Termin-ID:\s*([^\s\n]+)/i);return m?String(m[1]||'').trim():'';}
  function eventResource(ev){
    return {
      summary:title(ev),
      location:String(ev.address||''),
      description:description(ev),
      start:{dateTime:dt(ev.event_date,ev.start_time),timeZone:'Europe/Berlin'},
      end:{dateTime:dt(ev.event_date,ev.end_time),timeZone:'Europe/Berlin'}
    };
  }
  async function findMarker(calendarId,eventId,date){
    if(!calendarId||!eventId||!date)return '';
    const min=encodeURIComponent(String(date)+'T00:00:00'+offsetFor(date,'12:00'));
    const max=encodeURIComponent(String(date)+'T23:59:59'+offsetFor(date,'12:00'));
    const path='calendars/'+encodeURIComponent(calendarId)+'/events?singleEvents=true&timeMin='+min+'&timeMax='+max+'&maxResults=100';
    const r=await google.calendarApi('GET',path);
    const x=(r.items||[]).find(e=>marker(e.description)===String(eventId));
    return x?String(x.id||''):'';
  }
  async function workerCalendar(workerId){
    const q=await pool.query(
      "SELECT id,calendar_id,display_name,employee_name,active,provider FROM planner_workers_shadow WHERE id=$1 LIMIT 1",
      [String(workerId||'')]
    );
    const w=q.rows[0];
    if(!w||w.active===false||String(w.provider||'google')!=='google'||!String(w.calendar_id||''))
      throw new Error('Google-Kalender-Mitarbeiter wurde nicht gefunden.');
    return {id:String(w.id),calendarId:String(w.calendar_id),displayName:String(w.display_name||w.employee_name||w.id)};
  }
  async function resolveGoogleEventId(calendarId,ref){
    ref=String(ref||'').trim();if(!ref)return '';
    try{
      const e=await google.calendarApi('GET','calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(ref));
      if(e&&e.id)return String(e.id);
    }catch(_e){}
    try{
      const r=await google.calendarApi('GET','calendars/'+encodeURIComponent(calendarId)+'/events?iCalUID='+encodeURIComponent(ref)+'&maxResults=10');
      const e=(r.items||[])[0];if(e&&e.id)return String(e.id);
    }catch(_e){}
    return '';
  }
  async function saveExternal(item){
    if(!await authorized())throw new Error('Google Kalender ist noch nicht direkt mit Railway verbunden.');
    item=item||{};
    const w=await workerCalendar(item.workerId),customer=String(item.customer||'').trim(),address=String(item.address||'').trim();
    const task=String(item.task||'').trim(),date=String(item.date||'').trim(),start=String(item.start||'').trim(),end=String(item.end||'').trim();
    if(!customer||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||end<=start)
      throw new Error('Google-Termin enthält ungültige Pflichtdaten.');
    const gid=await resolveGoogleEventId(w.calendarId,item.googleEventId);
    if(!gid)throw new Error('Google-Termin wurde nicht gefunden. Bitte Kalender neu laden.');
    const resource={summary:customer,location:address,description:task,start:{dateTime:dt(date,start),timeZone:'Europe/Berlin'},end:{dateTime:dt(date,end),timeZone:'Europe/Berlin'}};
    const e=await google.calendarApi('PUT','calendars/'+encodeURIComponent(w.calendarId)+'/events/'+encodeURIComponent(gid),resource);
    return {ok:true,external:true,workerId:w.id,googleEventId:String(e.id||gid)};
  }
  async function deleteExternal(item){
    if(!await authorized())throw new Error('Google Kalender ist noch nicht direkt mit Railway verbunden.');
    item=item||{};const w=await workerCalendar(item.workerId),gid=await resolveGoogleEventId(w.calendarId,item.googleEventId);
    if(!gid)throw new Error('Google-Termin wurde nicht gefunden. Bitte Kalender neu laden.');
    await google.calendarApi('DELETE','calendars/'+encodeURIComponent(w.calendarId)+'/events/'+encodeURIComponent(gid));
    return {ok:true,external:true};
  }

  async function syncEventNow(eventId){
    if(!await authorized())return {ok:false,skipped:'not-authorized'};
    const q=await pool.query('SELECT * FROM planner_events_shadow WHERE id=$1 LIMIT 1',[String(eventId||'')]);
    if(!q.rowCount)return {ok:true,missing:true};
    const ev=q.rows[0],selected=j(ev.employee_ids_json,[]),map=j(ev.google_event_ids_json,{});
    const ids=[...new Set(selected.concat(Object.keys(map)))];
    const wq=ids.length?await pool.query(
      'SELECT id,provider,calendar_id,display_name,employee_name,active FROM planner_workers_shadow WHERE id=ANY($1::text[])',[ids]
    ):{rows:[]};
    const workers=new Map(wq.rows.map(w=>[String(w.id),w])),next=Object.assign({},map),resource=eventResource(ev);
    for(const wid of selected){
      const w=workers.get(String(wid));if(!w||w.active===false||String(w.provider||'google')!=='google'||!String(w.calendar_id||''))continue;
      const cal=String(w.calendar_id),known=String(next[wid]||'');
      let gid=known;
      if(!gid)gid=await findMarker(cal,ev.id,ev.event_date);
      if(gid){
        try{await google.calendarApi('PUT','calendars/'+encodeURIComponent(cal)+'/events/'+encodeURIComponent(gid),resource);}
        catch(e){
          gid=await findMarker(cal,ev.id,ev.event_date);
          if(gid)await google.calendarApi('PUT','calendars/'+encodeURIComponent(cal)+'/events/'+encodeURIComponent(gid),resource);
          else{const cr=await google.calendarApi('POST','calendars/'+encodeURIComponent(cal)+'/events',resource);gid=String(cr.id||'');}
        }
      }else{
        const cr=await google.calendarApi('POST','calendars/'+encodeURIComponent(cal)+'/events',resource);gid=String(cr.id||'');
      }
      if(gid)next[wid]=gid;
    }
    for(const wid of Object.keys(map)){
      if(selected.includes(wid))continue;
      const w=workers.get(String(wid)),gid=String(map[wid]||'');
      if(w&&gid&&String(w.calendar_id||'')){
        try{await google.calendarApi('DELETE','calendars/'+encodeURIComponent(String(w.calendar_id))+'/events/'+encodeURIComponent(gid));}catch(_e){}
      }
      delete next[wid];
    }
    await pool.query('UPDATE planner_events_shadow SET google_event_ids_json=$2,shadow_updated_at=now() WHERE id=$1',[String(ev.id),JSON.stringify(next)]);
    return {ok:true,eventId:String(ev.id),googleEventIds:next};
  }
  async function deleteMappingsNow(payload){
    if(!await authorized())return {ok:false,skipped:'not-authorized'};
    const map=payload&&payload.map&&typeof payload.map==='object'?payload.map:{};
    const ids=Object.keys(map);if(!ids.length)return {ok:true,count:0};
    const q=await pool.query('SELECT id,calendar_id FROM planner_workers_shadow WHERE id=ANY($1::text[])',[ids]);
    const wm=new Map(q.rows.map(r=>[String(r.id),String(r.calendar_id||'')]));
    let count=0;
    for(const wid of ids){
      const cal=wm.get(wid),gid=String(map[wid]||'');if(!cal||!gid)continue;
      try{await google.calendarApi('DELETE','calendars/'+encodeURIComponent(cal)+'/events/'+encodeURIComponent(gid));count++;}catch(_e){}
    }
    return {ok:true,count};
  }
  async function enqueueSync(eventId){
    const id='sync:'+String(eventId||'');if(!eventId)return;
    await pool.query(`
      INSERT INTO calendar_sync_queue_v10(id,operation,event_id,payload,status,attempts,last_error,next_attempt_at,updated_at)
      VALUES($1,'sync',$2,'{}'::jsonb,'pending',0,NULL,now(),now())
      ON CONFLICT(id) DO UPDATE SET status='pending',attempts=0,last_error=NULL,next_attempt_at=now(),updated_at=now()
    `,[id,String(eventId)]);
    setImmediate(()=>flush().catch(e=>console.error('CALENDAR_SYNC immediate',e.message)));
  }
  async function enqueueDelete(map){
    const id='delete:'+crypto.randomUUID();
    await pool.query(`
      INSERT INTO calendar_sync_queue_v10(id,operation,event_id,payload,status,attempts,next_attempt_at,updated_at)
      VALUES($1,'delete','',$2::jsonb,'pending',0,now(),now())
    `,[id,JSON.stringify({map:map&&typeof map==='object'?map:{}})]);
    setImmediate(()=>flush().catch(e=>console.error('CALENDAR_SYNC delete',e.message)));
  }
  async function flush(){
    if(flushing||!pool||!await authorized())return;
    flushing=true;
    try{
      const q=await pool.query(`
        SELECT id,operation,event_id,payload,attempts FROM calendar_sync_queue_v10
        WHERE status IN ('pending','failed') AND next_attempt_at<=now()
        ORDER BY created_at ASC LIMIT 20
      `);
      for(const r of q.rows){
        try{
          if(r.operation==='sync')await syncEventNow(r.event_id);
          else if(r.operation==='delete')await deleteMappingsNow(r.payload||{});
          await pool.query("UPDATE calendar_sync_queue_v10 SET status='done',last_error=NULL,updated_at=now() WHERE id=$1",[r.id]);
        }catch(e){
          const attempts=Number(r.attempts||0)+1,delay=Math.min(60,Math.max(1,Math.pow(2,Math.min(attempts,5))));
          await pool.query(`
            UPDATE calendar_sync_queue_v10 SET status='failed',attempts=$2,last_error=$3,
              next_attempt_at=now()+($4::text||' minutes')::interval,updated_at=now() WHERE id=$1
          `,[r.id,attempts,String(e&&e.message||e).slice(0,1000),String(delay)]);
        }
      }
    }finally{flushing=false;}
  }
  function customerKey(value){
    let s=String(value||'').trim().toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    s=s.replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    return s.replace(/\bstr\b/g,'strasse').replace(/([a-z0-9]+)str\b/g,'$1strasse');
  }
  function addDaysIso(date,days){
    const p=String(date||'').split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days||0),12));
    return d.toISOString().slice(0,10);
  }
  async function findExternalSynthetic(sourceId,date){
    sourceId=String(sourceId||'').trim();date=String(date||'').trim();
    if(!sourceId.startsWith('GOOGLE-')||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    const wq=await pool.query("SELECT id,display_name,employee_name,calendar_id FROM planner_workers_shadow WHERE active=true AND provider='google' AND COALESCE(calendar_id,'')<>'' ORDER BY sort_order");
    const timeMin=encodeURIComponent(date+'T00:00:00'+offsetFor(date,'12:00')),timeMax=encodeURIComponent(date+'T23:59:59'+offsetFor(date,'12:00'));
    for(const w of wq.rows){
      const cal=String(w.calendar_id||''),r=await google.calendarApi('GET','calendars/'+encodeURIComponent(cal)+'/events?singleEvents=true&timeMin='+timeMin+'&timeMax='+timeMax+'&maxResults=250');
      for(const e of (r.items||[])){
        const a='GOOGLE-'+String(w.id)+'-'+String(e.id||''),b='GOOGLE-'+String(w.id)+'-'+String(e.iCalUID||'');
        if(sourceId===a||sourceId===b)return {workerId:String(w.id),calendarId:cal,event:e};
      }
    }
    return null;
  }
  async function transferExternalToPlanner(item,actor){
    if(!await authorized())throw new Error('Google Kalender ist noch nicht direkt mit Railway verbunden.');
    item=item||{};const sourceId=String(item.sourceId||'').trim(),targetWorkerId=String(item.targetWorkerId||'').trim(),date=String(item.date||'').trim();
    if(!sourceId||!targetWorkerId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Quelltermin, Zielmitarbeiter oder Datum fehlt.');
    const found=await findExternalSynthetic(sourceId,date);if(!found)throw new Error('Google-Termin wurde nicht gefunden. Bitte Kalender neu synchronisieren.');
    const tq=await pool.query("SELECT id,display_name,employee_name,active FROM planner_workers_shadow WHERE id=$1 LIMIT 1",[targetWorkerId]);
    const tw=tq.rows[0];if(!tw||tw.active===false)throw new Error('Zielmitarbeiter ist nicht aktiv.');
    const e=found.event,sp=e.start||{},ep=e.end||{},st=sp.dateTime?fmtDateTime(sp.dateTime):{date:String(sp.date||date),time:'08:00'};
    const en=ep.dateTime?fmtDateTime(ep.dateTime):{date:st.date,time:'09:00'};
    const eventDate=st.date||date,start=st.time||'08:00',end=(en.date===eventDate&&en.time>start)?en.time:'09:00';
    const customer=String(e.summary||'').replace(/^🔧 WARTUNG ·\s*/i,'').trim()||'Termin',address=String(e.location||'').trim()||'-';
    const task=taskFromDescription(e.description)||'Termin',type=typeFromDescription(e.description),eventId='KT-'+crypto.randomUUID(),now=new Date().toISOString();
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO planner_events_shadow(
          id,customer,address,task,event_date,start_time,end_time,employee_ids_json,employee_names_json,
          google_event_ids_json,created_at_text,updated_at_text,updated_by,event_type,
          maintenance_customer_id,maintenance_object_id,maintenance_device_id,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}',$10,$10,$11,$12,'','','',now())
      `,[eventId,customer,address,task,eventDate,start,end,JSON.stringify([targetWorkerId]),JSON.stringify([String(tw.display_name||tw.employee_name||targetWorkerId)]),now,String(actor||''),type]);
      await client.query('COMMIT');
    }catch(err){try{await client.query('ROLLBACK');}catch(_e){}throw err;}finally{client.release();}
    await enqueueSync(eventId);
    await enqueueDelete({[found.workerId]:String(e.id||'')});
    return {ok:true,id:eventId,externalTransferred:true};
  }

  async function deleteEmployeeCalendarEvent(employee,eventId){
    if(!await authorized())throw new Error('Google Kalender ist noch nicht direkt mit Railway verbunden.');
    employee=String(employee||'').trim();eventId=String(eventId||'').trim();
    if(!employee||!eventId)return {ok:true,skipped:true};
    let calendarId='';
    const eq=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[employee]);
    if(eq.rowCount){
      const p=eq.rows[0].payload||{};calendarId=String(p.calendarId||'').trim();
    }
    if(!calendarId){
      const wq=await pool.query("SELECT calendar_id FROM planner_workers_shadow WHERE active=true AND provider='google' AND lower(employee_name)=lower($1) LIMIT 1",[employee]);
      calendarId=String(wq.rows[0]&&wq.rows[0].calendar_id||'').trim();
    }
    if(!calendarId)throw new Error('Für '+employee+' ist keine Google Kalender-ID hinterlegt.');
    let gid=await resolveGoogleEventId(calendarId,eventId);
    if(!gid)gid=eventId;
    try{
      await google.calendarApi('DELETE','calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(gid));
      return {ok:true,deleted:true,eventId:gid};
    }catch(e){
      const msg=String(e&&e.message||e);
      if(/404|not found|nicht gefunden/i.test(msg))return {ok:true,deleted:false,missing:true,eventId:gid};
      throw e;
    }
  }

  async function getEmployeeCalendarEvents(employee,startDate,days){
    if(!await authorized())throw new Error('Google Kalender ist noch nicht direkt mit Railway verbunden.');
    employee=String(employee||'').trim();startDate=String(startDate||'').trim();days=Math.max(1,Math.min(3,Number(days)||3));
    if(!employee||!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw new Error('Ungültige Mitarbeiter-/Kalenderdaten.');
    let calendarId='';
    const eq=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[employee]);
    if(eq.rowCount){
      const p=eq.rows[0].payload||{};calendarId=String(p.calendarId||'').trim();
    }
    if(!calendarId){
      const wq=await pool.query("SELECT calendar_id FROM planner_workers_shadow WHERE active=true AND provider='google' AND lower(employee_name)=lower($1) LIMIT 1",[employee]);
      calendarId=String(wq.rows[0]&&wq.rows[0].calendar_id||'').trim();
    }
    if(!calendarId)throw new Error('Für '+employee+' ist keine Google Kalender-ID hinterlegt.');
    const endDate=addDaysIso(startDate,days),timeMin=encodeURIComponent(startDate+'T00:00:00'+offsetFor(startDate,'12:00'));
    const timeMax=encodeURIComponent(endDate+'T00:00:00'+offsetFor(endDate,'12:00'));
    const [cal,done,offers]=await Promise.all([
      google.calendarApi('GET','calendars/'+encodeURIComponent(calendarId)+'/events?singleEvents=true&orderBy=startTime&timeMin='+timeMin+'&timeMax='+timeMax+'&maxResults=100'),
      pool.query('SELECT entry_date,customer,source_calendar_event_id FROM time_entries_shadow WHERE employee_name=$1 AND entry_date>=$2 AND entry_date<$3',[employee,startDate,endDate]),
      pool.query("SELECT calendar_event_id,status FROM inquiry_offers_shadow WHERE COALESCE(calendar_event_id,'')<>''")
    ]);
    const completedIds=new Set(),fallback=new Set();
    for(const r of done.rows){
      const sid=String(r.source_calendar_event_id||'').trim();if(sid)completedIds.add(sid);
      const d=String(r.entry_date||'').slice(0,10);if(d)fallback.add(d+'|'+customerKey(String(r.customer||'')));
    }
    for(const r of offers.rows){
      if(String(r.status||'')==='Verworfen')continue;
      const id=String(r.calendar_event_id||'').trim();if(id)completedIds.add(id);
    }
    const out=[];
    for(const e of (cal.items||[])){
      const sp=e.start||{},ep=e.end||{},st=sp.dateTime?fmtDateTime(sp.dateTime):{date:String(sp.date||''),time:'00:00'};
      const en=ep.dateTime?fmtDateTime(ep.dateTime):{date:String(ep.date||st.date),time:'23:59'};
      const titleText=String(e.summary||'').replace(/^🔧 WARTUNG ·\s*/i,''),loc=String(e.location||''),desc=String(e.description||'');
      const dgMarker=marker(desc),eventId=String(e.id||''),ical=String(e.iCalUID||'');
      const customerText=titleText+(loc?' - '+loc:'');
      const completed=completedIds.has(eventId)||completedIds.has(ical)||(!dgMarker&&fallback.has(st.date+'|'+customerKey(customerText)));
      if(completed)continue;
      out.push({
        id:eventId,title:titleText,location:loc,description:desc,
        maintenance:typeFromDescription(desc)==='Wartung'||/^🔧 WARTUNG ·/i.test(String(e.summary||'')),
        startDate:st.date,startTime:st.time,endTime:en.time,allDay:Boolean(sp.date&&!sp.dateTime)
      });
    }
    return out.sort((a,b)=>(a.startDate+' '+a.startTime).localeCompare(b.startDate+' '+b.startTime));
  }

  async function getPlannerEvents(startDate,endDate){
    const q=await pool.query(`
      SELECT * FROM planner_events_shadow WHERE event_date>=$1 AND event_date<=$2 ORDER BY event_date,start_time
    `,[String(startDate),String(endDate)]);
    const internal=q.rows.map(r=>({
      id:String(r.id||''),customer:String(r.customer||''),address:String(r.address||''),task:String(r.task||''),
      type:String(r.event_type||'Auftrag'),date:String(r.event_date||''),start:String(r.start_time||''),end:String(r.end_time||''),
      employeeIds:j(r.employee_ids_json,[]),employeeNames:j(r.employee_names_json,[]),
      maintenanceCustomerId:String(r.maintenance_customer_id||''),maintenanceObjectId:String(r.maintenance_object_id||''),
      maintenanceDeviceId:String(r.maintenance_device_id||''),external:false,source:'dg'
    }));
    if(!await authorized())return internal;
    const wq=await pool.query("SELECT id,display_name,employee_name,calendar_id FROM planner_workers_shadow WHERE active=true AND provider='google' AND COALESCE(calendar_id,'')<>'' ORDER BY sort_order");
    const tracked=new Set(),markers=new Set(internal.map(x=>x.id));
    for(const r of q.rows){const m=j(r.google_event_ids_json,{});Object.values(m).forEach(x=>tracked.add(String(x||'')));}
    const external=[];
    const timeMin=encodeURIComponent(String(startDate)+'T00:00:00'+offsetFor(startDate,'12:00'));
    const timeMax=encodeURIComponent(String(endDate)+'T23:59:59'+offsetFor(endDate,'12:00'));
    for(const w of wq.rows){
      const cal=String(w.calendar_id||''),path='calendars/'+encodeURIComponent(cal)+'/events?singleEvents=true&orderBy=startTime&timeMin='+timeMin+'&timeMax='+timeMax+'&maxResults=250';
      let r;try{r=await google.calendarApi('GET',path);}catch(e){console.error('CALENDAR_READ '+String(w.id)+' '+e.message);continue;}
      for(const ge of (r.items||[])){
        const mid=marker(ge.description);if(mid&&markers.has(mid))continue;
        if(tracked.has(String(ge.id||'')))continue;
        const sp=ge.start||{},ep=ge.end||{},st=sp.dateTime?fmtDateTime(sp.dateTime):{date:String(sp.date||''),time:'00:00'};
        const en=ep.dateTime?fmtDateTime(ep.dateTime):{date:String(ep.date||st.date),time:'23:59'};
        external.push({
          id:'GOOGLE-'+String(w.id)+'-'+String(ge.id||''),external:true,source:'google',googleEventId:String(ge.id||''),
          workerId:String(w.id||''),calendarId:cal,customer:String(ge.summary||'').replace(/^🔧 WARTUNG ·\s*/i,''),
          address:String(ge.location||''),task:taskFromDescription(ge.description),type:typeFromDescription(ge.description),
          date:st.date,start:st.time,end:en.time,employeeIds:[String(w.id||'')],
          employeeNames:[String(w.display_name||w.employee_name||'')]
        });
      }
    }
    return internal.concat(external).sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));
  }
  async function status(){
    const c=await connection();
    const q=pool?await pool.query("SELECT status,COUNT(*)::int n FROM calendar_sync_queue_v10 GROUP BY status"):{rows:[]};
    return {authorized:await authorized(),connection:c,queue:q.rows};
  }
  function start(){
    if(timer||!pool)return;
    timer=setInterval(()=>flush().catch(e=>console.error('CALENDAR_SYNC scheduled',e.message)),60*1000);
    if(timer.unref)timer.unref();
    setTimeout(()=>flush().catch(e=>console.error('CALENDAR_SYNC startup',e.message)),20000);
  }
  return {init,start,authorized,status,getPlannerEvents,getEmployeeCalendarEvents,deleteEmployeeCalendarEvent,findExternalSynthetic,transferExternalToPlanner,enqueueSync,enqueueDelete,syncEventNow,deleteMappingsNow,saveExternal,deleteExternal,workerCalendar,resolveGoogleEventId};
}

module.exports={createCalendarDirect};
