import pathlib,subprocess,json,re,hashlib,shutil,os
from bs4 import BeautifulSoup
R=pathlib.Path(os.environ.get('DG_BUILD_ROOT','/mnt/data/dg30'));F=R/'original/frontend';O=R/'release';O.mkdir(exist_ok=True)
def nodes(p):return json.loads(subprocess.check_output(['node',str(R/'ast.cjs'),str(p)]))
h=BeautifulSoup((F/'index.html').read_text(),'html.parser');(R/'core.js').write_text(h.find('script',src=False).get_text());replacement={n['name']:n['source'] for n in nodes(R/'src/core_changes.js') if n.get('name')}
a=[]
for n in nodes(R/'core.js'):
 name=n.get('name');s=n['source']
 if name in ['saveDayStatus','mergeRegieGroups']:continue
 if name in replacement:s=replacement[name]
 if name=='openMain':
  s=s.replace('customerPad.resize();employeePad.resize()','if(customerPad)customerPad.resize();if(employeePad)employeePad.resize()')
  s=s.replace('loadEmployeeDirectory();',"showEmployee();DG3.reports={};DG3.inquiries=[];DG3.orders=[];$('regieResult').replaceChildren();$('d3RunningList').replaceChildren();d3CheckBackend();loadEmployeeDirectory();")
 if name=='auth':s=s.replace("localStorage.getItem('dg_employee_pin')","sessionStorage.getItem('dg_employee_pin')")
 if name=='loginEmployee':s=s.replace("localStorage.setItem('dg_employee_pin',pin)","sessionStorage.setItem('dg_employee_pin',pin)")
 if name=='logout':s=s.replace("localStorage.removeItem('dg_employee_pin')","sessionStorage.removeItem('dg_employee_pin')")
 if name=='saveEmployeeAdminUi':s=s.replace("notes:$('adminNotes').value.trim()", "notes:$('adminNotes').value.trim(),hourlyWage:parseHoursInput($('adminHourlyWage')?.value||'0')")
 if name=='loadCalendarEvents':s=s.replace("localStorage.setItem('dg_calendar_'", "if(auth().employee!==a.employee)return;localStorage.setItem('dg_calendar_'")
 if n['type'] in ['ExpressionStatement','IfStatement'] and ('serviceWorker' in s or "addEventListener('load',init)" in s):continue
 if name=='calculateHours':s=next(x['source'] for x in nodes(F/'v58-patch.js') if x['source'].startswith('window.calculateHours=')).replace('window.calculateHours=function()','function calculateHours()',1).rstrip(';')
 a.append(s)
a.append((R/'src/runtime.js').read_text())
# Select only needed components. Retire duplicate API/report/menu implementations and observers.
config={
'v45-patch.js':({'showGlobal','groupsFor','enhanceRegie'},{'writes','baseApi','pendingDelete','baseLoadRegie'},{'deleteEntry','dgCancelDeleteEntry','dgConfirmDeleteEntry','loadRegieReports','api'}),
'v48-patch.js':(set(),set(),set()),'v49-patch.js':(set(),set(),set()),
'v50-patch.js':({'addRiskModal','executeBilling'},{'pendingBillingIds','originalBilling'},{'markRegieObjectBilled','dg50ForceBilling','dg50CancelBilling'}),
'v51-patch.js':(set(),{'baseLoadDay'},{'loadDay'}),
'v54-patch.js':({'enhanceRegiePhotos'},{'oldLoadRegie','localCtx','oldSetMessage'},{'loadRegieReports','setMessage'}),
'v55-patch.js':(set(),{'prevLoadRegie','prevOpenObject'},{'loadRegieReports','mergeRegieGroups','setRegieObjectJobStatus','markRegieObjectBilled','openObjectView','renderBossEntries'}),
'v56-patch.js':(set(),{'oldSet'},{'setMessage'}),
'v57-patch.js':(set(),{'oldRegie'},{'loadRegieReports'}),
'v59-patch.js':({'removeOldVersionBanner','checkBackend59'},{'apiBefore59','cacheNonce59','cacheReads59','versionObserver59'},{'api'}),
'v61-patch.js':(set(),{'baseApi61','oldShowBoss61','obs61'},{'api','showBoss'}),
'v62-patch.js':({'closeRegie'},{'oldShowBoss'},{'showBoss'}),
'v62-ui-stable.js':(set(),{'oldShowBoss','oldLoad'},{'showBoss','dg62Load'}),
'v62-actions-stable.js':({'enhanceDrag'},{'oldLoad','suppressClick'},{'dg62Load'}),
'v62-places.js':({'setVersion'},{'oldBoss'},{'showBoss'})}
for file,(names,vars,targets) in config.items():
 b=[]
 for n in nodes(F/file):
  s=n['source'];name=n.get('name')
  if name in names or set(n.get('decls')or[])&(vars|{'lv','hv'}):continue
  if not name:
   if 'document.title=' in s or s.startswith(('if(lv)','if(hv)','obs61.','versionObserver59.')):continue
   if '__DG_' in s and len(s)<130:continue
   if any('window.'+t+'=' in s for t in targets):continue
   if s in ['addRiskModal();','enhanceDrag();','closeRegie();','refreshMonthHours();']:continue
   if file in ['v54-patch.js','v61-patch.js'] and s.startswith("document.addEventListener('click'"):continue
   if file=='v59-patch.js' and ('checkBackend59' in s or "addEventListener('online'" in s):continue
  if s.startswith('setTimeout('):
   if file=='v62-places.js':s='ensureCalendar();ensureOtherAddressFields();'
   elif file=='v61-patch.js':s='activate61();'
   elif file=='v62-ui-stable.js':s='decorate();'
   elif file=='v56-patch.js':s='styleUi();'
   elif file in ['v54-patch.js','v57-patch.js','v59-patch.js']:continue
  if file=='v50-patch.js':s=s.replace("if(typeof mergeRegieGroups==='function')groups=mergeRegieGroups(groups||[]);",'').replace('Offene Regieberichte','Abgeschlossene Auftraege')
  if file=='v62-patch.js':
   if name=='renderDay':s=s.replace('x.title=e.external?', 'x.dataset.eventId=e.id;x.title=e.external?')
   if name=='resetModal':s=s.replace("editId='';","editId='KT-'+uid();DG3.shareId='';")
   if s.startswith('window.dg62Popout='):
    s=s.replace("document.querySelectorAll('style')", "document.querySelectorAll('style,link[rel=stylesheet]')").replace("w.document.close();", "w.document.close();const base=w.document.createElement('base');base.href=location.href;w.document.head.prepend(base);")
   if s.startswith('window.dg62Save='):s=s.replace("id:editMode==='dg'?editId:''","id:editMode==='google'?'':editId")
   if s.startswith('window.dg62Load='):s=s.replace('renderWorkers();renderWeek();','renderWorkers();renderWeek();if(DG3.enhanceCalendar)DG3.enhanceCalendar();')
  if file=='v62-ui-stable.js':s=s.replace("if(details.open&&typeof window.dg62Load==='function')window.dg62Load()",'').replace("cancel.classList.add('danger','dg62-cancel-red')","cancel.classList.add('secondary')")
  if file=='v62-actions-stable.js' and name=='confirmShare':s=s.replace("item:{id:'',","item:{id:(DG3.shareId||(DG3.shareId='KT-'+uid())),")
  b.append(s)
 if file=='v62-patch.js':b.append('DG3.calendar={event:id=>events.find(x=>x.id===id),workers:()=>workers,edit:()=>({id:editId,mode:editMode})};')
 a.append('\n/* Compiled component '+file+' */\n(function(){\n'+'\n'.join(b)+'\n})();')
for file in ['office.js','workflow.js','calendar.js','startup.js']:a.append((R/'src'/file).read_text())
js='\n\n'.join(a)+'\n';js=re.sub(r'onclick="(?!return )([A-Za-z_$][^"]*?\))"',r'onclick="return \1"',js)
(O/'app-3.0.js').write_text(js)
css='\n'.join(x.get_text() for x in h.find_all('style'))+'\n'+(R/'src/style.css').read_text();(O/'app-3.0.css').write_text(css)
for e in h.find_all('script')+h.find_all('style'):e.decompose()
for t in list(h.select('#employeeView>.card>h2')):
 if t.get_text(strip=True)=='Tagesstatus':t.parent.decompose()
h.find(id='workEntryCard').insert_before(h.new_tag('div',id='dayStatusMessage'))
h.title.string='DG Zeiterfassung 3.0';h.select_one('.login-card .center.muted.small').string='Version 3.0';h.select_one('.hero .head-row strong').string='Zeiterfassung - 3.0'
for b in list(h.select('#bossView button')):
 if b.get('onclick')=="loadRegieReports('Laufend')":b.decompose()
for b in h.find_all('button'):
 if b.get_text(strip=True) in ['Abbrechen','Nein']:b['class']=['btn','secondary']
for name in ['manifest.json','dg_icon_192.png','dg_icon_512.png']:shutil.copy2(F/name,O/name)
m=json.loads((O/'manifest.json').read_text());m['name']='DG Zeiterfassung 3.0';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
jh=hashlib.sha256(js.encode()).hexdigest()[:12];ch=hashlib.sha256(css.encode()).hexdigest()[:12]
h.head.append(h.new_tag('link',rel='stylesheet',href='./app-3.0.css?v='+ch));sc=h.new_tag('script',src='./app-3.0.js?v='+jh);sc['defer']='';h.body.append(sc);(O/'index.html').write_text(str(h))
assets=['./','./index.html','./app-3.0.js?v='+jh,'./app-3.0.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png'];(O/'sw.js').write_text((R/'src/sw.js').read_text().replace('__BUILD__',jh).replace('__ASSETS__',json.dumps(assets)))
print('Build:',len(js.encode()),'JS bytes; 1 JS asset, 0 legacy loaders; hash',jh)
