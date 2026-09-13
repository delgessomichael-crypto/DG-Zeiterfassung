import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.5.3' in h.get_text() and 'Zeiterfassung - 3.5.3' in h.get_text()
assert len(h.select('script[src]'))==1 and 'app-3.5.js' in h.select_one('script[src]')['src']
assert 'Besichtigungstermin' in js and 'createInspectionOffer' in js and 'setTimeout(d35InstallInspectionButton,0)' in js
assert "stage:'Zu erstellen'" in js and "d3Count('offers',o.length+c.length)" in js
assert 'AQON PURE ANFRAGEN' in js and "action:'syncCustomerInquiries'" in js and 'aqonSyncAt' not in js
assert 'Montag bis Sonntag' in js and 'd35MandatoryDayClosure' in js and "w===0||w===6" in js and "status.includes('feiertag')" in js
assert 'von 6 Bild' not in js and 'Maximal 6 Bilder möglich' not in js
assert 'dg-zeiterfassung-3-5-3-' in sw and 'withPatches' not in sw
print('PASS DG 3.5.3: AQON syncs on every open; offer count, chef inspection, unlimited photos and weekend/holiday rules remain valid.')