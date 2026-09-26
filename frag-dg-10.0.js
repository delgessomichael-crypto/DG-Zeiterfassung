(function(){
'use strict';

function q(id){return document.getElementById(id);}

function payload(extra){
  if(typeof window.chefPayload==='function')return window.chefPayload(extra||{});
  return extra||{};
}

function ensureFragCss(){
  if(q('dg10FragCss'))return;
  var s=document.createElement('style');
  s.id='dg10FragCss';
  s.textContent=
    '#dg10FragTopBar{margin:0 0 11px;padding:12px;border:2px solid #405fa7;border-radius:15px;background:#f4f7ff;box-sizing:border-box}'+
    '#dg10FragBottomBar{margin:12px 0 0;padding:12px;border:2px solid #405fa7;border-radius:15px;background:#f4f7ff;box-sizing:border-box}'+
    '.dg10-frag-answer{white-space:pre-wrap;line-height:1.45}'+
    '.dg10-frag-tasks{display:grid;gap:8px;margin-top:10px}'+
    '.dg10-frag-task{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid #cbd5e1;border-radius:12px;background:#fff}'+
    '.dg10-frag-task input[type="checkbox"]{width:20px!important;height:20px!important;margin:0!important}'+
    '.dg10-frag-task-title{font-weight:800;color:#1f2937}'+
    '.dg10-frag-task-detail{font-size:13px;color:#64748b;margin-top:2px}'+
    '.dg10-frag-task-meta{font-size:12px;color:#31589e;margin-top:4px;font-weight:700;display:flex;gap:6px;flex-wrap:wrap;align-items:center}'+
    '.dg10-frag-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;background:#eef4ff;color:#31589e}'+
    '.dg10-frag-priority{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;font-weight:900}'+
    '.dg10-frag-priority.rot{background:#fee2e2;color:#991b1b}'+
    '.dg10-frag-priority.gelb{background:#fef3c7;color:#92400e}'+
    '.dg10-frag-priority.grün{background:#dcfce7;color:#166534}'+
    '.dg10-frag-task.done{opacity:.58;background:#f8fafc}'+
    '.dg10-frag-task.done .dg10-frag-task-title{text-decoration:line-through}'+
    '.dg10-frag-highlight{outline:4px solid rgba(49,88,158,.35)!important;outline-offset:3px!important;transition:outline-color .4s ease}'+
    '@media(max-width:700px){.dg10-frag-task{grid-template-columns:auto minmax(0,1fr)}.dg10-frag-task .dg10-frag-open{grid-column:1/-1;width:100%}}';
  document.head.appendChild(s);
}

function recordCardHasId(card,id){
  if(!card||!id)return false;
  var els=card.querySelectorAll('[data-d3-args]');
  for(var i=0;i<els.length;i++){
    var raw=String(els[i].getAttribute('data-d3-args')||'');
    try{
      var args=JSON.parse(raw);
      if(Array.isArray(args)&&args.some(function(v){return String(v)===String(id);} ))return true;
    }catch(_e){
      if(raw.indexOf(String(id))!==-1)return true;
    }
  }
  return false;
}

function waitForTaskCard(selector,id,tries){
  return new Promise(function(resolve){
    var left=Number(tries||35);
    (function tick(){
      var root=document.querySelector(selector);
      if(root){
        var cards=root.querySelectorAll('.report-card');
        for(var i=0;i<cards.length;i++)if(recordCardHasId(cards[i],id))return resolve(cards[i]);
      }
      if(--left<=0)return resolve(null);
      setTimeout(tick,120);
    })();
  });
}

async function openFragTask(task){
  if(!task||typeof window.d3Open!=='function')throw new Error('Der Zielbereich ist noch nicht bereit.');
  var type=String(task.sourceType||''),id=String(task.sourceId||''),stage=String(task.stage||'');
  var selector='',fallback=null;
  if(type==='inquiry'){
    window.d3Open('d3InquiriesGroup','d3Inquiries');
    selector='#d3InquiryList';
    fallback=q('d3InquiriesGroup')||q('d3Inquiries');
  }else if(type==='offer'){
    var child=stage==='Zu erstellen'?'d3OfferCreate':(stage==='Offen'?'d3OfferOpen':'d3OfferArchive');
    window.d3Open('d3Offers',child);
    selector='#'+child+'List';
    fallback=q('d3Offers');
  }else if(type==='order'){
    window.d3Open('d3Running');
    selector='#d3OrderPlan';
    fallback=q('d3Running');
  }else{
    throw new Error('Für diesen Punkt ist kein direkter App-Bereich hinterlegt.');
  }
  var card=await waitForTaskCard(selector,id,40);
  var target=card||fallback;
  if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:card?'center':'start'});
  if(card){
    card.classList.add('dg10-frag-highlight');
    setTimeout(function(){card.classList.remove('dg10-frag-highlight');},3500);
  }
}

function renderFragResult(r,out){
  out.replaceChildren();
  var answer=document.createElement('div');
  answer.className='dg10-frag-answer';
  answer.textContent=String(r&&r.text||'Keine Antwort erhalten.');
  out.appendChild(answer);

  var tasks=Array.isArray(r&&r.tasks)?r.tasks:[];
  if(!tasks.length)return;

  var list=document.createElement('div');
  list.className='dg10-frag-tasks';
  tasks.forEach(function(task){
    var row=document.createElement('div');
    row.className='dg10-frag-task';

    var done=document.createElement('input');
    done.type='checkbox';
    done.title='Nach Erledigung abhaken';

    var body=document.createElement('div');
    var title=document.createElement('div');
    title.className='dg10-frag-task-title';
    title.textContent=String(task.title||task.customer||'Vorgang');
    var detail=document.createElement('div');
    detail.className='dg10-frag-task-detail';
    detail.textContent=String(task.detail||'');
    var meta=document.createElement('div');
    meta.className='dg10-frag-task-meta';
    var pr=document.createElement('span');
    var priority=String(task.priority||'grün').toLowerCase();
    pr.className='dg10-frag-priority '+priority;
    pr.textContent=(priority==='rot'?'🔴':priority==='gelb'?'🟡':'🟢')+' '+priority.toUpperCase();
    meta.appendChild(pr);
    [task.category,task.customer,task.stage].filter(Boolean).forEach(function(v){
      var chip=document.createElement('span');
      chip.className='dg10-frag-chip';
      chip.textContent=String(v);
      meta.appendChild(chip);
    });
    body.appendChild(title);
    if(detail.textContent)body.appendChild(detail);
    body.appendChild(meta);

    var open=document.createElement('button');
    open.type='button';
    open.className='btn secondary dg10-frag-open';
    open.textContent='Vorgang öffnen';
    open.onclick=async function(ev){
      ev.preventDefault();
      open.disabled=true;
      var old=open.textContent;
      open.textContent='Öffne ...';
      try{await openFragTask(task);}
      catch(e){alert(String(e&&e.message||e));}
      finally{open.disabled=false;open.textContent=old;}
    };

    done.onchange=function(){row.classList.toggle('done',done.checked);};
    row.appendChild(done);
    row.appendChild(body);
    row.appendChild(open);
    list.appendChild(row);
  });
  out.appendChild(list);
}

function fragSurface(surface){
  var bottom=surface==='bottom';
  return {
    input:q(bottom?'dg10FragBottomInput':'dg10FragTopInput'),
    out:q(bottom?'dg10FragBottomOut':'dg10FragTopOut'),
    send:q(bottom?'dg10FragBottomSend':'dg10FragTopSend'),
    mic:q(bottom?'dg10FragBottomMic':'dg10FragTopMic')
  };
}

function quickAskFragDG(prompt,surface){
  var target=surface||'bottom';
  var ui=fragSurface(target);
  if(!ui.input)return;
  var sx=window.scrollX||0,sy=window.scrollY||0;
  ui.input.value=String(prompt||'');
  askFragDG(target);
  requestAnimationFrame(function(){window.scrollTo(sx,sy);});
}

function showPlannedFeature(title,text){
  alert(title+'\n\n'+text);
}

function showBottomInfo(text,type){
  var ui=fragSurface('bottom');
  if(!ui.out)return;
  ui.out.className='status '+(type||'info');
  ui.out.textContent=String(text||'');
  if(ui.input)try{ui.input.focus({preventScroll:true});}catch(_e){ui.input.focus();}
}

async function askFragDG(surface){
  var target=surface||'top';
  var ui=fragSurface(target);
  var input=ui.input;
  var out=ui.out;
  var send=ui.send;
  var prompt=String(input&&input.value||'').trim();
  if(!prompt||!out)return;

  if(send)send.disabled=true;
  out.className='status info';
  out.textContent='Frag DG arbeitet ...';

  try{
    if(typeof window.api!=='function')throw new Error('App-Schnittstelle ist noch nicht bereit.');
    var r=await window.api(payload({action:'getAiAssistantV10',prompt:prompt}));
    out.className=(r&&(r.configured===false||r.billingRequired))?'status warn':'status ok';
    renderFragResult(r,out);
  }catch(e){
    out.className='status error';
    out.textContent=String(e&&e.message||e);
  }finally{
    if(send)send.disabled=false;
  }
}

function bindSpeech(surface){
  var ui=fragSurface(surface||'top');
  var input=ui.input;
  var mic=ui.mic;
  if(!input||!mic||mic.dataset.bound==='1')return;

  mic.dataset.bound='1';
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    mic.disabled=true;
    mic.title='Spracherkennung wird von diesem Browser nicht unterstützt.';
    return;
  }

  mic.onclick=function(ev){
    ev.preventDefault();
    var rec=new SR();
    rec.lang='de-DE';
    rec.interimResults=false;
    rec.continuous=false;
    mic.textContent='■';

    rec.onresult=function(e){
      var text='';
      for(var i=0;i<e.results.length;i++){
        if(e.results[i][0])text+=e.results[i][0].transcript+' ';
      }
      text=text.trim();
      if(text)input.value=(input.value?input.value.trim()+' ':'')+text;
    };

    rec.onend=function(){mic.textContent='🎤';};
    rec.onerror=function(){mic.textContent='🎤';};
    rec.start();
  };
}

function ensureTop(){
  var boss=q('bossView');
  if(!boss||boss.classList.contains('hidden'))return;

  var box=q('dg10FragTopBar');
  if(!box){
    box=document.createElement('section');
    box.id='dg10FragTopBar';
    box.style.cssText='';
    box.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'+
        '<strong style="font-size:18px;color:#31589e">Frag DG</strong>'+
        '<span class="muted small">Intelligente Unterstützung für den Büroalltag</span>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center">'+
        '<input id="dg10FragTopInput" type="text" placeholder="Frag DG – z. B. Was ist heute dringend?" style="margin:0;min-height:46px">'+
        '<button type="button" class="btn secondary" id="dg10FragTopMic" title="Spracheingabe">🎤</button>'+
        '<button type="button" class="btn primary" id="dg10FragTopSend">Frag DG</button>'+
      '</div>'+
      '<div id="dg10FragTopOut" style="margin-top:8px;white-space:pre-wrap"></div>';

    var appRoot=q('mainScreen')&&q('mainScreen').querySelector(':scope > .app');
    var accessShell=q('dg10AccessShell');
    if(appRoot)appRoot.insertBefore(box,accessShell||appRoot.firstChild);
    else boss.insertBefore(box,boss.firstChild);

    q('dg10FragTopSend').onclick=function(){askFragDG('top');};
    q('dg10FragTopInput').onkeydown=function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        askFragDG('top');
      }
    };
    bindSpeech('top');
  }else{
    var appRoot2=q('mainScreen')&&q('mainScreen').querySelector(':scope > .app');
    var accessShell2=q('dg10AccessShell');
    if(appRoot2&&box.parentElement!==appRoot2)appRoot2.insertBefore(box,accessShell2||appRoot2.firstChild);
    else if(appRoot2&&accessShell2&&box.nextElementSibling!==accessShell2)appRoot2.insertBefore(box,accessShell2);
  }
  box.style.display='';
}

function toggleSection(sec,title){
  if(!sec||!title)return;
  var collapsed=sec.classList.toggle('dg10-section-collapsed');
  title.setAttribute('aria-expanded',String(!collapsed));
  var ch=title.querySelector('.dg10-section-chevron');
  if(ch)ch.textContent=collapsed?'▸':'▾';
}

function ensureSection(){
  var boss=q('bossView');
  var dash=boss&&boss.querySelector(':scope > .d3-dashboard');
  var archive=dash&&dash.querySelector('.dg80-final-section[data-section="archive"]');
  if(!dash||!archive)return;

  var sec=q('dg10FragOwnSection');
  if(!sec){
    sec=document.createElement('section');
    sec.id='dg10FragOwnSection';
    sec.className='dg80-final-section';
    sec.dataset.section='fragDG';
    sec.innerHTML=
      '<div class="dg80-final-section-title" role="button" tabindex="0" aria-expanded="true">'+
        '<span>Frag DG</span><span class="dg10-section-chevron" aria-hidden="true">▾</span>'+
      '</div>'+
      '<div class="dg80-final-grid">'+
        '<button type="button" id="dg10FragDaily" class="d3-tile dg80-final-tile"><span>Tagesbriefing</span><strong>☀</strong></button>'+
        '<button type="button" id="dg10FragPriority" class="d3-tile dg80-final-tile"><span>Prioritäten & offene Punkte</span><strong>!</strong></button>'+
        '<button type="button" id="dg10FragApp" class="d3-tile dg80-final-tile"><span>App-Verwaltung</span><strong>⚙</strong></button>'+
        '<button type="button" id="dg10FragWeb" class="d3-tile dg80-final-tile"><span>Website & SEO</span><strong>⌂</strong></button>'+
        '<button type="button" id="dg10FragOwnRef" class="d3-tile dg80-final-tile"><span>Referenzbaustellen</span><strong>›</strong></button>'+
        '<button type="button" id="dg10FragGoogle" class="d3-tile dg80-final-tile"><span>Google Business</span><strong>G</strong></button>'+
      '</div>'+
      '<div id="dg10FragBottomBar">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'+
          '<strong style="font-size:18px;color:#31589e">Frag DG</strong>'+
          '<span class="muted small">Bleibt im Frag-DG-Arbeitsbereich</span>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center">'+
          '<input id="dg10FragBottomInput" type="text" placeholder="Frag DG – z. B. Was ist heute dringend?" style="margin:0;min-height:46px">'+
          '<button type="button" class="btn secondary" id="dg10FragBottomMic" title="Spracheingabe">🎤</button>'+
          '<button type="button" class="btn primary" id="dg10FragBottomSend">Frag DG</button>'+
        '</div>'+
        '<div id="dg10FragBottomOut" style="margin-top:8px;white-space:pre-wrap"></div>'+
      '</div>';

    archive.insertAdjacentElement('afterend',sec);
    sec.dataset.dg10HubVersion='4';

    var title=sec.querySelector(':scope > .dg80-final-section-title');
    title.addEventListener('click',function(ev){
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toggleSection(sec,title);
    },true);

    title.addEventListener('keydown',function(ev){
      if(ev.key!=='Enter'&&ev.key!==' ')return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toggleSection(sec,title);
    },true);

    q('dg10FragBottomSend').onclick=function(){askFragDG('bottom');};
    q('dg10FragBottomInput').onkeydown=function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        askFragDG('bottom');
      }
    };
    bindSpeech('bottom');

    var daily=q('dg10FragDaily');
    if(daily)daily.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      quickAskFragDG('Erstelle mein Tagesbriefing für heute. Ordne alle direkt bearbeitbaren offenen Vorgänge nach rot, gelb, grün. Zeige besonders: heute fällig, überfällig, wartet auf Kunde, Angebot zu erstellen und Auftrag ohne Termin. Gib mir die verknüpfbaren Vorgänge als Arbeitsliste.','bottom');
    };
    var priority=q('dg10FragPriority');
    if(priority)priority.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      quickAskFragDG('Prüfe meine offenen Anfragen, Angebote und Aufträge auf Priorität. Kennzeichne rot nur bei echter Dringlichkeit oder Blockade, gelb für zeitnahe Bearbeitung, grün für normal. Zeige die nächsten sinnvollen Schritte und verknüpfe jeden konkreten Vorgang.','bottom');
    };
    var app=q('dg10FragApp');
    if(app)app.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      quickAskFragDG('Prüfe die aktuell verfügbaren App-Vorgänge auf offene Arbeit, Auffälligkeiten und sinnvolle nächste Schritte. Nenne nur Dinge, die aus den App-Daten ableitbar sind und verknüpfe konkrete Vorgänge.','bottom');
    };
    var web=q('dg10FragWeb');
    if(web)web.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      showPlannedFeature('Website & SEO','Diese Steuerung ist vorbereitet. Für direkte Änderungen an delgesso.info verbinden wir als nächsten Schritt die Website mit Frag DG. Danach kann Frag DG Seiten prüfen, Inhalte aktualisieren, SEO-/KI-Optimierungen vorbereiten und nach Freigabe veröffentlichen.');
    };
    var b=q('dg10FragOwnRef');
    if(b)b.onclick=function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof window.dg10OpenReferenceProjects==='function'){
        window.dg10OpenReferenceProjects();
      }else{
        alert('Referenzbaustellen werden noch geladen. Bitte die App einmal aktualisieren.');
      }
    };
    var google=q('dg10FragGoogle');
    if(google)google.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      var ui=fragSurface('bottom');
      if(ui.input)ui.input.value='Google Business';
      showBottomInfo('Google Business ist für Del Gesso eingerichtet: Das Unternehmensprofil ist über Windsor.ai in ChatGPT verbunden. Hier im Frag-DG-Bereich bleiben wir an derselben Stelle. 5-Sterne-Antworten und Google-Beiträge können vorbereitet werden; das direkte Veröffentlichen aus der App selbst folgt erst mit der separaten Windsor-Bridge.','info');
    };
  }else{
    if(sec.dataset.dg10HubVersion!=='4'){
      sec.remove();
      return ensureSection();
    }
    if(sec.previousElementSibling!==archive)archive.insertAdjacentElement('afterend',sec);
  }
  sec.dataset.dg10HubVersion='4';
}

function mount(){
  ensureFragCss();
  var boss=q('bossView');
  var box=q('dg10FragTopBar');
  if(!boss||boss.classList.contains('hidden')){
    if(box)box.style.display='none';
    return;
  }
  ensureTop();
  ensureSection();
}

function schedule(){setTimeout(mount,0);}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
}else{
  schedule();
}

new MutationObserver(schedule).observe(document.documentElement,{
  subtree:true,
  childList:true,
  attributes:true,
  attributeFilter:['class']
});

setInterval(mount,1000);
})();