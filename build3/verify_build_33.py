import pathlib,re
from bs4 import BeautifulSoup
root=pathlib.Path(__file__).resolve().parent/'release';h=BeautifulSoup((root/'index.html').read_text(),'html.parser');scripts=h.select('script[src]')
assert len(scripts)==1 and scripts[0]['src'].startswith('./app-3.3.js?v=')
js=(root/'app-3.3.js').read_text();css=(root/'app-3.3.css').read_text();sw=(root/'sw.js').read_text()
for x in ['Anfrage bei Trustlocal öffnen','d33LoadBilledArchive','addRegieAttachments','Datei / Bild hinzufügen','target="_blank" rel="noopener noreferrer" href="mailto:']:
    assert x in js,x
assert "parts[1]>=2" in js
assert 'app-3.3.js' in sw and 'dg-zeiterfassung-3-3-' in sw
assert '.d33-billed-nav' in css and '.d33-attachments' in css
assert 'withPatches' not in sw
print('PASS DG 3.3: single app script, Trustlocal UI, safe mail links, billed folders, attachment upload, backend 3.2 gate.')
