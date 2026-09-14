import pathlib
R=pathlib.Path(__file__).resolve().parent/'release'
html=(R/'index.html').read_text();js=(R/'app-5.0.js').read_text();css=(R/'app-5.0.css').read_text();sw=(R/'sw.js').read_text();manifest=(R/'manifest.json').read_text()
assert 'DG Zeiterfassung 5.2.0' in html
assert 'Version 5.2.0' in html
assert 'Zeiterfassung - 5.2.0' in html
assert "version:'5.2.0'" in js
assert "DG_APP_VERSION='5.2.0'" in js
assert "clientVersion:'5.2.0'" in js
assert 'Google-GS 5.2.0' in js and 'Google-GS 3.0' not in js
assert 'getDashboardSummary51' in js and 'AUTO_SYNC_TTL=180000' in js
assert 'CALENDAR_TTL=12000' in js and 'DAY_TTL=15000' in js
assert 'dg51_dashboard' in js and 'dg51_employees' in js
assert 'dg_device_session' in js and 'createDeviceSession:true' in js and 'employeeLogout' in js
assert 'Fehleintrag löschen' in js and 'deleteBossDayEntry' in js and 'deleteBossDayEntry512' in js
assert 'Alle Kunden' in js and 'd50OpenAllCustomers' in js
assert 'Rechnungsempfänger:' in js and 'Ausführungsort:' in js
assert 'Geräte-ID:' in js and 'd50-device-badge' in js
assert 'Gerätebilder &amp; Unterlagen / Wartungsberichte' in js
assert 'setPointerCapture' in js and 'pointercancel' in js and 'lostpointercapture' in js
assert 'Kunde korrigieren' in js and 'dgRequestCustomerCorrection' in js
assert 'Ausführungsort entspricht Kundendaten' in js and 'copy504' in js
assert '+ manuell erfassen' in js and 'addManualMaintenanceCount' in js
# 5.2 Monatsabschluss / Lohnprüfung
assert 'Monatsabschluss &amp; Lohnübergabe' in js
assert 'getMonthPayrollAudit' in js and 'markPayrollIssueReviewed' in js
assert 'setPayrollMonthStatus' in js and 'updateBossDayEntry' in js
assert 'adminPayrollType' in js and 'adminMonthlySalary' in js and 'adminPayrollRelevant' in js
assert 'Tag öffnen und prüfen' in js and 'Zeit korrigieren' in js
assert 'dg-zeiterfassung-5-2-0-' in sw
assert 'DG Zeiterfassung 5.2.0' in manifest and 'DG 5.2.0' in manifest
assert '.d50-customer-row' in css and '.d501-attachments' in css
assert html.count('app-5.0.js')==1 and html.count('app-5.0.css')==1
assert 'app-3.5.js' not in html and 'app-3.5.css' not in html
print('DG 5.2.0 verification OK')
