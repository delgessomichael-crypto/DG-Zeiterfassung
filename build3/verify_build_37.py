import pathlib
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent/'release'
h=BeautifulSoup((R/'index.html').read_text(),'html.parser');js=(R/'app-3.5.js').read_text();css=(R/'app-3.5.css').read_text();sw=(R/'sw.js').read_text()
assert 'Version 3.7.2' in h.get_text() and 'Zeiterfassung - 3.7.2' in h.get_text()
assert len(h.select('script[src]'))==1 and 'app-3.5.js' in h.select_one('script[src]')['src']
for needle in ['Kunde anlegen','Kunde verwalten','Wartungsarchiv','getMaintenanceOverview','saveMaintenanceCustomer','getMaintenanceArchive','d37PlannerPreview','Wartung terminieren','Reparaturen außerhalb des Wartungsvertrags','d371RefreshMaintenanceReminder']:
    assert needle in js, needle
for needle in ['d37-maint-nav','d37-months','d37-planner-preview','d37-customer-form']:
    assert needle in css, needle
assert 'dg-zeiterfassung-3-7-2-' in sw
print('PASS DG 3.7.2: Wartungsverwaltung und Monatsreminder vorhanden.')
