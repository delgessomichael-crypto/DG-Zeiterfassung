(function(){
'use strict';
if(window.__DG_V61_PATCH__)return;window.__DG_V61_PATCH__=true;
const $=id=>document.getElementById(id);
const esc61=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loadingEmployees61=false;
let minWage61=null;

function renameAdminHeading61(){
  document.querySelectorAll('.dg48-head h2,.card > h2').forEach(h=>{
    const txt=String(h.textContent||'').trim();
    if(txt.startsWith('Mitarbeiterverwaltung')&&txt!=='Mitarbeiterverwaltung')h.textContent='Mitarbeiterverwaltung';
  });
}

function ensureWageField61(){
  if($('adminHourlyWage'))return;
  const sections=[...document.querySelectorAll('.admin-section')];
  const payout=sections.find(s=>{const h=s.querySelector(':scope > h3');return h&&String(h.textContent||'').trim().startsWith('6. Auszahlung')});
  if(!payout)return;
  const wrap=document.createElement('div');wrap.id='dg61WageWrap';wrap.innerHTML='<label for="adminHourlyWage">Stundenlohn brutto</label><input id="adminHourlyWage" inputmode="decimal" placeholder="z. B. 26,50"><div id="dg61WageStatus" class="muted small" style="margin-top:6px"></div>';
  const paymentLabel=[...payout.querySelectorAll(':scope > label')].find(l=>String(l.textContent||'').includes('Auszahlungsart'));
  if(paymentLabel) payout.insertBefore(wrap,paymentLabel); else payout.prepend(wrap);
  $('adminHourlyWage').addEventListener('input',()=>checkWage61(false));
  $('adminHourlyWage').addEventListener('blur',()=>checkWage61(true));
  const type=$('adminEmploymentType');if(type)type.addEventListener('change',()=>checkWage61(false));
  const entry=$('adminEntryDate');if(entry)entry.addEventListener('change',()=>loadMinimumWage61().then(()=>checkWage61(false)));
  loadMinimumWage61();
}

function isoToday61(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseMoney61(v){const n=Number(String(v==null?'':v).trim().replace(',','.'));return Number.isFinite(n)?n:0}
function fmtMoney61(v){return Number(v||0).toFixed(2).replace('.',',')}
async function loadMinimumWage61(){
  if(!navigator.onLine||typeof window.api!=='function')return null;
  const entry=$('adminEntryDate')&&$('adminEntryDate').value;const today=isoToday61();const date=entry&&entry>today?entry:today;
  try{const r=await window.api({action:'getMinimumWage',date});minWage61=r||null;checkWage61(false);return minWage61}catch(_e){return null}
}
function checkWage61(showBlank){
  const input=$('adminHourlyWage'),st=$('dg61WageStatus');if(!input||!st)return true;
  const type=$('adminEmploymentType')?$('adminEmploymentType').value:'';
  if(type==='Azubi'){st.className='status info';st.textContent='Azubi: allgemeiner gesetzlicher Mindestlohn wird hier nicht geprüft.';return true}
  const wage=parseMoney61(input.value);
  if(!wage){st.className=showBlank?'status warn':'muted small';st.textContent=showBlank?'Bitte Brutto-Stundenlohn eintragen.':(minWage61&&minWage61.amount?'Gesetzlicher Mindestlohn: '+fmtMoney61(minWage61.amount)+' €/Std. ab '+formatDateDE(minWage61.from):'');return false}
  if(minWage61&&Number(minWage61.amount)>0&&wage+0.0001<Number(minWage61.amount)){st.className='status error';st.textContent='Stundenlohn zu niedrig. Mindestlohn: '+fmtMoney61(minWage61.amount)+' €/Std. ab '+formatDateDE(minWage61.from)+'.';return false}
  st.className='status ok';st.textContent=minWage61&&minWage61.amount?'✓ Mindestlohn eingehalten ('+fmtMoney61(minWage61.amount)+' €/Std.).':'✓ Stundenlohn eingetragen.';return true
}

function renderEmployeeSelect61(rows){
  window.__employeeAdminRows=Array.isArray(rows)?rows:[];
  const select=$('adminEmployeeSelect');if(!select)return;
  const previous=select.value;
  const q=String($('adminEmployeeSearch')?$('adminEmployeeSearch').value:'').trim().toLocaleLowerCase('de-DE');
  const options=window.__employeeAdminRows.map((x,i)=>({x,i})).filter(o=>!q||[o.x.name,o.x.firstName,o.x.lastName,o.x.personnelNumber].some(v=>String(v||'').toLocaleLowerCase('de-DE').includes(q)));
  select.innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+options.map(o=>'<option value="'+o.i+'">'+esc61(o.x.name)+(o.x.personnelNumber?' · PN '+esc61(o.x.personnelNumber):'')+(o.x.active?'':' (inaktiv)')+'</option>').join('');
  if(previous!==''&&options.some(o=>String(o.i)===String(previous)))select.value=previous;
  const tb=$('adminTimeBankEmployee');if(tb){const old=tb.value;tb.innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+window.__employeeAdminRows.map(x=>'<option value="'+esc61(x.name)+'">'+esc61(x.name)+(x.active?'':' (inaktiv)')+'</option>').join('');if(window.__employeeAdminRows.some(x=>x.name===old))tb.value=old}
}

const oldRenderAdmin61=window.renderEmployeeAdminList;
window.renderEmployeeAdminList=function(rows){
  if(typeof oldRenderAdmin61==='function')oldRenderAdmin61.apply(this,arguments);
  renderEmployeeSelect61(rows);
};
window.filterEmployeeAdminOptions=function(){renderEmployeeSelect61(window.__employeeAdminRows||[])};

window.dg61LoadEmployeeAdmin=async function(force){
  if(loadingEmployees61||!navigator.onLine)return;
  const select=$('adminEmployeeSelect');if(!select)return;
  if(!force&&Array.isArray(window.__employeeAdminRows)&&window.__employeeAdminRows.length){renderEmployeeSelect61(window.__employeeAdminRows);return}
  loadingEmployees61=true;const oldHtml=select.innerHTML;select.disabled=true;select.innerHTML='<option value="">Bestandsmitarbeiter werden geladen …</option>';
  try{const rows=await window.api(chefPayload({action:'getEmployeeAdminData'}));renderEmployeeSelect61(rows||[]);if(!(rows||[]).length)select.innerHTML='<option value="">Keine Bestandsmitarbeiter gefunden</option>'}
  catch(e){select.innerHTML=oldHtml||'<option value="">Bitte Mitarbeiter wählen</option>';if(typeof setMessage==='function')setMessage('employeeAdminStatus','Bestandsmitarbeiter konnten nicht geladen werden: '+(e&&e.message?e.message:'Unbekannter Fehler.'),'error')}
  finally{select.disabled=false;loadingEmployees61=false}
};

const oldEditAdmin61=window.editEmployeeAdmin;
if(typeof oldEditAdmin61==='function')window.editEmployeeAdmin=function(i){const r=oldEditAdmin61.apply(this,arguments);ensureWageField61();const x=(window.__employeeAdminRows||[])[i];if($('adminHourlyWage'))$('adminHourlyWage').value=x&&Number(x.hourlyWage)>0?fmtMoney61(x.hourlyWage):'';minWage61=x&&x.minimumWage?x.minimumWage:minWage61;checkWage61(false);return r};
const oldClearAdmin61=window.clearEmployeeAdminForm;
if(typeof oldClearAdmin61==='function')window.clearEmployeeAdminForm=function(){const r=oldClearAdmin61.apply(this,arguments);ensureWageField61();if($('adminHourlyWage'))$('adminHourlyWage').value='';loadMinimumWage61();checkWage61(false);return r};

const baseApi61=window.api;
if(typeof baseApi61==='function')window.api=async function(payload){
  const p=payload&&typeof payload==='object'?Object.assign({},payload):payload;
  if(p&&p.action==='saveEmployeeAdmin'){
    ensureWageField61();
    p.item=Object.assign({},p.item||{}, {hourlyWage: parseMoney61($('adminHourlyWage')?$('adminHourlyWage').value:'')});
    const type=p.item.employmentType||($('adminEmploymentType')?$('adminEmploymentType').value:'');
    if(type!=='Azubi'&&!checkWage61(true))throw new Error('Bitte den Stundenlohn prüfen.');
  }
  return baseApi61(p);
};

function activate61(){renameAdminHeading61();ensureWageField61()}
const oldShowBoss61=window.showBoss;if(typeof oldShowBoss61==='function')window.showBoss=function(){const r=oldShowBoss61.apply(this,arguments);setTimeout(()=>{activate61();dg61LoadEmployeeAdmin(true)},100);return r};
document.addEventListener('focusin',e=>{if(e.target&&e.target.id==='adminEmployeeSelect')dg61LoadEmployeeAdmin(false)});
document.addEventListener('click',e=>{const h=e.target.closest&&e.target.closest('.dg48-head');if(h&&String(h.textContent||'').includes('Mitarbeiterverwaltung'))setTimeout(()=>{activate61();dg61LoadEmployeeAdmin(false)},0)},true);
const obs61=new MutationObserver(()=>renameAdminHeading61());obs61.observe(document.documentElement,{subtree:true,childList:true});
setTimeout(activate61,150);

function removeOldVersionBanners61(){['dg58BackendStatus','dg59BackendStatus','dg60BackendStatus'].forEach(id=>{const x=$(id);if(x)x.remove()})}
async function checkBackend61(){if(!navigator.onLine)return;try{const r=await window.api({action:'ping'}),v=Number(r&&r.version||0);removeOldVersionBanners61();let x=$('dg61BackendStatus');if(v===61){if(x)x.remove();return}if(!x){x=document.createElement('div');x.id='dg61BackendStatus';x.className='status error';x.style.position='sticky';x.style.top='0';x.style.zIndex='20003';x.style.margin='0';x.style.borderRadius='0';document.body.prepend(x)}x.textContent='Frontend Version 61 ist aktiv, aber das Google-Backend ist nicht Version 61. Bitte GS v61 bereitstellen.'}catch(_e){}}
window.addEventListener('online',()=>setTimeout(checkBackend61,150));setTimeout(checkBackend61,900);

document.title='DG Zeiterfassung v61';const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 61';const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v61';
})();
