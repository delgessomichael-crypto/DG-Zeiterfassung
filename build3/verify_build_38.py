import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.8' in h.get_text() and 'Zeiterfassung - 3.8' in h.get_text()
for needle in ['deleteMaintenanceDevice','deleteMaintenanceCustomer','Gerät bearbeiten','Kompletten Kunden löschen','d38-month-year','Wartungstermine können nicht in die Vergangenheit gelegt werden','Nächste Wartung fällig:','maintenanceDeviceId=DG37.plannerLink.deviceId','M38.loaded']:
    assert needle in js, needle
assert 'dg-zeiterfassung-3-8-' in sw
print('PASS DG 3.8 Wartungsverwaltung')
