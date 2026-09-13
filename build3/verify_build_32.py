import pathlib,re,json
from bs4 import BeautifulSoup
root=pathlib.Path(__file__).resolve().parent/'release'
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
scripts=html.select('script[src]')
assert len(scripts)==1 and scripts[0]['src'].startswith('./app-3.2.js?v='), 'exactly one app script required'
assert 'Version 3.2' in html.get_text(), 'visible version missing'
assert not html.select('#dayStatus'), 'employee day status must stay removed'
js=(root/'app-3.2.js').read_text()
css=(root/'app-3.2.css').read_text()
sw=(root/'sw.js').read_text()
for token in ['traffic-green','traffic-orange','traffic-red','d3TileOpen','d3InquiriesGroup','Anfragenarchiv','Termin wurde vereinbart','createInquiryReminder','getInquiryReminders','d32-photo-grid','d32GalleryMove','d32IsAqonOrder']:
    assert token in js or token in css, token+' missing'
assert "stage:'Offen'" in js and "stage:'Zu erstellen'" in js, 'offer dashboard must count both offer stages'
assert "parts[0]===3&&parts[1]>=1" in js, 'backend 3.1 gate missing'
assert js.find('/* DG 3.2:') < js.find('function d3Startup()'), '3.2 features must load before startup'
assert js.count('function d3Startup()')==1
assert 'app-3.1.js' not in str(html) and 'app-3.0.js' not in str(html)
assert 'withPatches' not in sw and 'dg-zeiterfassung-3-2-' in sw
assert sw.count('app-3.2.js')==1
assert '.traffic-orange' in css and '.d32-gallery' in css
for e in html.select('[src],link[href]'):
    val=e.get('src',e.get('href',''))
    if val.startswith(('http:','https:','data:')): continue
    assert (root/val.split('?')[0]).exists(), val
print('PASS: DG 3.2 single-script release, dashboard traffic lights, jump navigation, inquiry archive/reminders, AQON filtering and gallery present.')
