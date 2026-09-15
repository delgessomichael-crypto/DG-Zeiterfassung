import pathlib
R=pathlib.Path(__file__).resolve().parent/'release'
html=(R/'index.html').read_text();js=(R/'app-5.0.js').read_text();css=(R/'app-5.0.css').read_text();sw=(R/'sw.js').read_text();manifest=(R/'manifest.json').read_text()
for x in ['DG Zeiterfassung 5.2.4','Version 5.2.4','Zeiterfassung - 5.2.4']: assert x in html
assert "version:'5.2.4'" in js and "DG_APP_VERSION='5.2.4'" in js and "clientVersion:'5.2.4'" in js
assert 'Google-GS 5.2.0.2' in js
for x in ['Monatsabschluss &amp; Lohnübergabe','getMonthPayrollAudit','setPayrollMonthStatus','updateBossDayEntry','Lohnübergabe','Eintrag entfernen & Stunden abziehen','Überprüfung notwendig','dg521-employee-head','dg521ConfirmDelete','Schnellprüfung','Alle Auffälligkeiten geprüft – Mitarbeiter freigeben','dg522ReviewOne','dg522ReleaseEmployee','✓ Geprüft – korrekt']: assert x in js
assert 'Prüfhinweise werden geladen' not in js
assert 'dg-zeiterfassung-5-2-4-' in sw
assert 'DG Zeiterfassung 5.2.4' in manifest and 'DG 5.2.4' in manifest
assert html.count('app-5.0.js')==1 and html.count('app-5.0.css')==1
print('DG 5.2.4 verification OK')
