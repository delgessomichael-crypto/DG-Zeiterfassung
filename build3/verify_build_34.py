import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.4.js').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.4' in h.get_text()
assert len(h.select('script[src]'))==1 and 'app-3.4.js' in h.select_one('script[src]')['src']
assert 'AQON PURE ANFRAGEN' in js and 'd34AqonInquiries' in js
assert 'Dropbox-Fotos öffnen' in js and 'Termin bei AQON melden' in js
assert "parts[0]===3&&parts[1]>=3" in js
assert 'dg-zeiterfassung-3-4-' in sw and 'withPatches' not in sw
assert js.count('MutationObserver')==0
print('PASS DG 3.4: one app script, AQON submenu/links, GS 3.3 guard, no legacy loader.')
