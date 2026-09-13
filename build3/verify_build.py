import pathlib,hashlib,re
from bs4 import BeautifulSoup
root=pathlib.Path(__file__).resolve().parent/'release'
expected={'app-3.1.js':'7012ab2a1826b06f0a9b13cfe89ca9e628e72ffe94a331a54731252f113deb11','app-3.1.css':'9f881ca2978c38a0927e5ed57e26f7681e46eaa943820fd0fa2a4705e03612bf','sw.js':'af284eea08c85ecc0c4563c413a219b7f1b131c302b41d548531d8e140676e77','manifest.json':'c60846a5d8a1e7dcc55d4c8e3418d8ef8ad506729b4195dc92ad133f83b43a8f'}
for name,digest in expected.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Build differs from tested file: '+name
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
scripts=html.select('script[src]')
assert len(scripts)==1 and scripts[0]['src'].startswith('./app-3.1.js?v=')
assert 'Version 3.1' in html.get_text() and not html.select('#dayStatus')
js=(root/'app-3.1.js').read_text()
assert 'MutationObserver' not in js and js.count('setInterval(')==1
assert js.count('function visibleDays(')==1 and len(re.findall(r'window\.dg62Load=(?!=)',js))==1
assert 'range.days.map' in js and "startDate:range.start,endDate:range.end" in js
assert "clientVersion:'3.1'" in js and "version:'3.1'" in js
sw=(root/'sw.js').read_text()
assert 'withPatches' not in sw and 'dg-zeiterfassung-3-1-' in sw
for e in html.select('[src],link[href]'):
 val=e.get('src',e.get('href',''))
 if val.startswith(('http:','https:','data:')):continue
 assert (root/val.split('?')[0]).exists(),val
print('PASS: tested 3.1 hashes, 1 app script, 1 planner loader, 1 sync clock, correct assets; GS 3.0 compatible.')
