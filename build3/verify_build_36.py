import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();css=(R/'app-3.5.css').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.6' in h.get_text() and 'Zeiterfassung - 3.6' in h.get_text()
assert len(h.select('script[src]'))==1 and 'app-3.5.js' in h.select_one('script[src]')['src']
for needle in ['Wartungsverträge','Wartungen','d36Maintenance','getMaintenanceContracts','Nächste Wartung fällig','d36PlannerType','Wartung übernehmen','nextMaintenanceDue']:
    assert needle in js, needle
assert 'repeat(7' in css and 'd36-maintenance-event' in css and 'd36-maintenance-due' in css
assert 'dg-zeiterfassung-3-6-' in sw
assert 'withPatches' not in sw
print('PASS DG 3.6: Wartungsmenü, Wartungskachel, Kalenderkennzeichnung und Pflichtfeld vorhanden.')
