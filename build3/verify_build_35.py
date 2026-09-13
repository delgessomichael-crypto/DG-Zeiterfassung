import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.5.1' in h.get_text()
assert 'Zeiterfassung - 3.5.1' in h.get_text()
assert len(h.select('script[src]'))==1 and 'app-3.5.js' in h.select_one('script[src]')['src']
assert 'AQON PURE ANFRAGEN' in js and 'd34AqonInquiries' in js
assert 'Besichtigungstermin' in js and 'createInspectionOffer' in js and 'd35InspectionBtn' in js
assert 'Montag bis Sonntag' in js
assert 'd35MandatoryDayClosure' in js and "w===0||w===6" in js and "status.includes('feiertag')" in js
assert "parts[0]===3&&parts[1]>=4" in js
assert 'von 6 Bild' not in js
assert 'Maximal 6 Bilder möglich' not in js
assert 'dg-zeiterfassung-3-5-1-' in sw and 'withPatches' not in sw
assert js.count('MutationObserver')==0
print('PASS DG 3.5.1: one app script, correct version, unlimited photos, Sun/holiday hours, Mon-Fri closure duty, chef inspection, AQON flow, GS 3.4 guard.')
