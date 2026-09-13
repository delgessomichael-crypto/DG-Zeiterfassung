import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();css=(R/'app-3.5.css').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.9' in h.get_text() and 'Zeiterfassung - 3.9' in h.get_text()
for needle in ['Wartungen total','Wartungen ausgeführt','Noch offene Wartungen','Geräte-ID suchen','reserveMaintenanceDeviceId','findMaintenanceDeviceByInternalId','loadCalendarEvents()','internalDeviceId']:
    assert needle in js, needle
for needle in ['d39-year-stats','d39-device-id','d39-device-result']:
    assert needle in css, needle
assert 'dg-zeiterfassung-3-9-' in sw
print('PASS DG 3.9: Jahresampeln, Geräte-ID und Mitarbeiter-Kalenderrefresh vorhanden.')
