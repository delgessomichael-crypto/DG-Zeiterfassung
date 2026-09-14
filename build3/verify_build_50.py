import pathlib,re
R=pathlib.Path(__file__).resolve().parent/'release'
html=(R/'index.html').read_text();js=(R/'app-5.0.js').read_text();css=(R/'app-5.0.css').read_text();sw=(R/'sw.js').read_text();manifest=(R/'manifest.json').read_text()
assert 'DG Zeiterfassung 5.1.1' in html
assert 'Version 5.1.1' in html
assert 'Zeiterfassung - 5.1.1' in html
assert "version:'5.1.1'" in js
assert "DG_APP_VERSION='5.1.1'" in js
assert "clientVersion:'5.1.1'" in js
assert 'Google-GS 5.1.1' in js and 'Google-GS 3.0' not in js
assert 'getDashboardSummary51' in js
assert 'AUTO_SYNC_TTL=180000' in js
assert 'CALENDAR_TTL=12000' in js and 'DAY_TTL=15000' in js
assert 'dg51_dashboard' in js and 'dg51_employees' in js
assert 'Promise.allSettled([loadDay(false),loadCalendarEvents(false)])' in js
assert 'dg_device_session' in js and 'createDeviceSession:true' in js and 'employeeLogout' in js
assert 'migrateExistingLogin511' in js and 'DGSESSION' in js
assert 'Alle Kunden' in js and 'd50OpenAllCustomers' in js
assert 'Rechnungsempfänger:' in js and 'Ausführungsort:' in js
assert 'Geräte-ID:' in js and 'd50-device-badge' in js
assert 'Gerätebilder &amp; Unterlagen / Wartungsberichte' in js
assert 'getMaintenanceAttachment' in js and 'deleteMaintenanceAttachment' in js
assert 'setPointerCapture' in js and 'pointercancel' in js and 'lostpointercapture' in js
assert 'Kunde korrigieren' in js and 'dgRequestCustomerCorrection' in js
assert 'Ausführungsort entspricht Kundendaten' in js and 'copy504' in js
assert '+ manuell erfassen' in js and 'addManualMaintenanceCount' in js
assert 'dg-zeiterfassung-5-1-1-' in sw
assert 'DG Zeiterfassung 5.1.1' in manifest and 'DG 5.1.1' in manifest
assert '.d50-customer-row' in css and '.d501-attachments' in css
assert html.count('app-5.0.js')==1 and html.count('app-5.0.css')==1
assert 'app-3.5.js' not in html and 'app-3.5.css' not in html
print('DG 5.1.1 verification OK')
