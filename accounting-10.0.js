/* DG App 10 - Rechnungswesen office section */
(function(){
'use strict';

const V='20260924-1515-accounting-shell1';
const q=id=>document.getElementById(id);
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function boss(){return q('bossView');}
function dash(){return boss()?.querySelector(':scope > .d3-dashboard');}
function currentYear(){return new Date().getFullYear();}
function currentMonth(){return new Date().getMonth()+1;}

function css(){
  if(q('dg10AccountingCss'))return;
  const s=document.createElement('style');
  s.id='dg10AccountingCss';
  s.textContent=
    '#bossView .dg10-accounting-section{margin-top:8px}'+
    '#bossView .dg10-accounting-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;align-items:stretch}'+
    '#bossView .dg10-accounting-tile{background:#e8f7ea!important;color:#185c2c!important;border:1px solid #b9e4c1!important;min-height:118px!important;box-shadow:0 4px 14px rgba(15,23,42,.05)!important;cursor:pointer!important}'+
    '#bossView .dg10-accounting-tile:hover{background:#d9f2de!important;border-color:#84cf93!important;transform:translateY(-1px)}'+
    '#bossView .dg10-accounting-tile>span,#bossView .dg10-accounting-tile>strong{color:#185c2c!important}'+
    '#bossView .dg10-accounting-add strong{font-size:44px!important;line-height:1!important}'+
    '.dg10-account-card{padding:16px}'+
    '.dg10-account-note{padding:16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569;font-weight:700;line-height:1.45}'+
    '.dg10-account-filter{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr);gap:12px;margin:12px 0 16px}'+
    '.dg10-account-filter label{display:block;font-weight:900;margin-bottom:5px}'+
    '.dg10-account-filter select{width:100%}'+
    '.dg10-account-archive-menu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}'+
    '.dg10-account-archive-menu button{min-height:86px;border:1px solid #b9e4c1;border-radius:15px;background:#e8f7ea;color:#185c2c;font:inherit;font-weight:900;padding:12px;cursor:pointer}'+
    '.dg10-account-archive-menu button:hover{background:#d9f2de}'+
    '.dg10-account-back{margin-bottom:14px}'+
    '@media(max-width:700px){#bossView .dg10-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dg10-account-filter,.dg10-account-archive-menu{grid-template-columns:1fr}}';
  document.head.appendChild(s);
}

function monthOptions(selected){
  return MONTHS.map((name,i)=>{
    const v=i+1;return '<option value="'+v+'" '+(v===selected?'selected':'')+'>'+esc(name)+'</option>';
  }).join('');
}
function yearOptions(selected){
  let h='';
  for(let y=currentYear()+1;y>=2020;y--)h+='<option value="'+y+'" '+(y===selected?'selected':'')+'>'+y+'</option>';
  return h;
}
function archivePanelHtml(key,title){
  const y=currentYear(),m=currentMonth();
  return '<button type="button" class="btn secondary dg10-account-back" data-dg10-account-back="archive">← Archiv</button>'+
    '<h2>'+esc(title)+'</h2>'+
    '<div class="muted small">Archiv wird immer nach Monat und Jahr angezeigt.</div>'+
    '<div class="dg10-account-filter">'+
      '<div><label>Jahr</label><select data-dg10-archive-year="'+esc(key)+'">'+yearOptions(y)+'</select></div>'+
      '<div><label>Monat</label><select data-dg10-archive-month="'+esc(key)+'">'+monthOptions(m)+'</select></div>'+
    '</div>'+
    '<div class="dg10-account-note" data-dg10-archive-result="'+esc(key)+'"></div>';
}

function ensureCards(){
  const r=boss();if(!r)return;
  const specs=[
    ['dg10InvoiceIncoming','Rechnungseingang',
      '<h2>Rechnungseingang</h2><div class="dg10-account-note">Der Bereich für Eingangsrechnungen ist angelegt. Die eigentliche Erfassung und Dokumentenübernahme bauen wir im nächsten Schritt ein.</div>'],
    ['dg10TaxAdvisor','Steuerberater',
      '<h2>Steuerberater</h2><div class="dg10-account-note">Der Steuerberater-Bereich ist vorbereitet. Hier können später Monatsübergaben, Belege und Exporte gebündelt werden.</div>'],
    ['dg10FinanceArchive','Archiv',
      '<h2>Archiv</h2><div class="muted small">Bitte einen Archivbereich auswählen.</div><div class="dg10-account-archive-menu">'+
      '<button type="button" data-dg10-archive="created">Erstellte Rechnungen</button>'+
      '<button type="button" data-dg10-archive="paid">Bezahlte Rechnungen</button>'+
      '<button type="button" data-dg10-archive="tax">Steuerberater</button>'+
      '</div>'],
    ['dg10ArchiveCreated','Erstellte Rechnungen',archivePanelHtml('created','Erstellte Rechnungen')],
    ['dg10ArchivePaid','Bezahlte Rechnungen',archivePanelHtml('paid','Bezahlte Rechnungen')],
    ['dg10ArchiveTax','Steuerberater Archiv',archivePanelHtml('tax','Steuerberater')],
    ['dg10FinanceAdd','Bereich hinzufügen',
      '<h2>Bereich hinzufügen</h2><div class="dg10-account-note">Die große Plus-Kachel ist vorbereitet. Hier können wir später frei benannte manuelle Rechnungswesen-Bereiche hinzufügen.</div>']
  ];
  specs.forEach(([id,title,html])=>{
    let card=q(id);
    if(!card){
      card=document.createElement('div');
      card.id=id;card.className='card d3-main dg10-account-card';
      card.dataset.dg10Title=title;
      card.innerHTML=html;
      r.appendChild(card);
    }
  });
  wireCards();
  refreshAllArchiveLabels();
}

function showCard(id,title,parent){
  const r=boss(),card=q(id);if(!r||!card)return;
  try{window.dg80OfficeClose?.();}catch(_e){}
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  card.classList.add('dg80-shell-active');
  const bar=q('dg80OfficeToolbar');
  if(bar)bar.classList.add('active');
  if(typeof window.dg80OfficeSetPath==='function')window.dg80OfficeSetPath(parent||'Rechnungswesen',title,false);
  else if(q('dg80OfficeTitle'))q('dg80OfficeTitle').textContent=(parent?parent+' > ':'')+title;
  setTimeout(()=>bar?.scrollIntoView({behavior:'smooth',block:'start'}),20);
}

function openArchive(kind){
  if(kind==='created')showCard('dg10ArchiveCreated','Erstellte Rechnungen','Rechnungswesen > Archiv');
  else if(kind==='paid')showCard('dg10ArchivePaid','Bezahlte Rechnungen','Rechnungswesen > Archiv');
  else showCard('dg10ArchiveTax','Steuerberater','Rechnungswesen > Archiv');
}

function archiveLabel(key){
  const y=Number(document.querySelector('[data-dg10-archive-year="'+key+'"]')?.value||currentYear());
  const m=Number(document.querySelector('[data-dg10-archive-month="'+key+'"]')?.value||currentMonth());
  const out=document.querySelector('[data-dg10-archive-result="'+key+'"]');
  if(out)out.textContent='Keine Einträge für '+MONTHS[Math.max(0,Math.min(11,m-1))]+' '+y+'.';
}
function refreshAllArchiveLabels(){['created','paid','tax'].forEach(archiveLabel);}

function wireCards(){
  const archive=q('dg10FinanceArchive');
  if(archive&&!archive.dataset.dg10Wired){
    archive.dataset.dg10Wired='1';
    archive.addEventListener('click',e=>{
      const b=e.target.closest('[data-dg10-archive]');if(!b)return;
      e.preventDefault();openArchive(b.dataset.dg10Archive);
    });
  }
  ['dg10ArchiveCreated','dg10ArchivePaid','dg10ArchiveTax'].forEach(id=>{
    const card=q(id);if(!card||card.dataset.dg10Wired)return;
    card.dataset.dg10Wired='1';
    card.addEventListener('click',e=>{
      const b=e.target.closest('[data-dg10-account-back="archive"]');
      if(b){e.preventDefault();showCard('dg10FinanceArchive','Archiv','Rechnungswesen');}
    });
    card.addEventListener('change',e=>{
      const k=e.target?.dataset?.dg10ArchiveYear||e.target?.dataset?.dg10ArchiveMonth;
      if(k)archiveLabel(k);
    });
  });
}

function accountingTile(key,label,count,extra){
  return '<button type="button" class="d3-tile dg10-accounting-tile '+(extra||'')+'" data-dg10-account="'+esc(key)+'">'+
    '<span>'+esc(label)+'</span><strong>'+esc(count||'›')+'</strong></button>';
}

function installSection(){
  const d=dash();if(!d)return false;
  css();ensureCards();
  // Die bisherige Rechnungs-Kachel aus "Tägliches Geschäft" entfernen.
  d.querySelector('[data-dg80-final="completed"]')?.remove();

  let sec=d.querySelector(':scope > .dg10-accounting-section');
  if(!sec){
    sec=document.createElement('section');
    sec.className='dg80-final-section dg10-accounting-section';
    sec.dataset.section='accounting';
    sec.innerHTML='<div class="dg80-final-section-title">Rechnungswesen</div>'+
      '<div class="dg10-accounting-grid">'+
        accountingTile('create','Rechnungen zu erstellen',q('d3Count-completed')?.textContent||'…')+
        accountingTile('incoming','Rechnungseingang','›')+
        accountingTile('tax','Steuerberater','›')+
        accountingTile('archive','Archiv','›')+
        accountingTile('add','', '+','dg10-accounting-add')+
      '</div>';
    const admin=d.querySelector(':scope > .dg80-final-section[data-section="admin"]');
    if(admin)d.insertBefore(sec,admin);else d.appendChild(sec);

    sec.addEventListener('click',e=>{
      const b=e.target.closest('[data-dg10-account]');if(!b)return;
      e.preventDefault();e.stopPropagation();
      const key=b.dataset.dg10Account;
      if(key==='create'){
        if(typeof window.dg80OfficeOpen==='function'){
          window.dg80OfficeOpen('completed',{force:true});
          setTimeout(()=>window.dg80OfficeSetPath?.('Rechnungswesen','Rechnungen zu erstellen',false),0);
        }
      }else if(key==='incoming')showCard('dg10InvoiceIncoming','Rechnungseingang','Rechnungswesen');
      else if(key==='tax')showCard('dg10TaxAdvisor','Steuerberater','Rechnungswesen');
      else if(key==='archive')showCard('dg10FinanceArchive','Archiv','Rechnungswesen');
      else if(key==='add')showCard('dg10FinanceAdd','Bereich hinzufügen','Rechnungswesen');
    },true);
  }

  // Zähler synchron halten, falls Dashboard-Daten nachgeladen wurden.
  const source=q('d3Count-completed');
  const target=sec.querySelector('[data-dg10-account="create"] strong');
  if(source&&target&&source.textContent)target.textContent=source.textContent;
  return true;
}

function install(){
  if(installSection())document.documentElement.dataset.dgAccounting=V;
  let tries=0;
  const retry=setInterval(()=>{tries++;installSection();if(tries>=20)clearInterval(retry);},250);
  const d=boss();
  if(d&&!d.dataset.dg10AccountingObserver){
    d.dataset.dg10AccountingObserver='1';
    const mo=new MutationObserver(()=>{clearTimeout(window.__dg10AccountingTimer);window.__dg10AccountingTimer=setTimeout(installSection,0);});
    mo.observe(d,{childList:true,subtree:true});
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
