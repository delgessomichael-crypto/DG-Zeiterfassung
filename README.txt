DG ZEITERFASSUNG 6.0

Produktivstand GitHub-PWA / Google-Apps-Script-Backend: Version 6.0.

Version 6.0 konsolidiert den bisherigen 5.x-Stand mit Fokus auf Geschwindigkeit und weniger Ueberlagerungen.

Frontend / PWA:
- Basis bleibt app-5.0.js mit den darin bereits zusammengefuehrten produktiven Funktionen.
- Statt mehrerer nachgeladener Overlay-Dateien wird nur noch app-6.0-runtime.js geladen.
- app-5.2.6-offers.js, app-5.2.7-regie.js sowie die Office-Patches 5.2.8/5.2.9/5.3.0 werden nicht mehr geladen.
- Angebotszaehler werden nicht mehr mehrfach direkt beim Start nachgeladen, sondern bedarfsbezogen und kurzzeitig gecacht.
- Regieberichte verursachen keine zusaetzliche getObjectReports-Abfrage je Kundenkarte mehr; die Historie kommt serverseitig komplett.
- Backend-Ping wird je Sitzung bis zu 30 Minuten gecacht.
- Identische parallele Lesezugriffe werden weiterhin zusammengefasst.
- Bueromodus bleibt nach Aktualisieren aktiv; zweites App-Fenster bleibt verfuegbar.
- Service Worker Cache: dg-zeiterfassung-6-0-20260916b.

Backend / Google Apps Script:
- Zielversion: 6.0.
- Gmail-Kundenanfragen-Automatik aus 5.2.0.8 ist enthalten.
- Regiebericht-Historie / Merge-Konsistenz aus 5.2.0.4+ ist enthalten.
- Monatsabschluss, Lohnpruefung und Steuerberater-Uebergabe bleiben enthalten.
- Systemcheck meldet Version 6.0.

Bereitstellung:
1. Google_GS_6.0_SMARTMAIL_AUTOMATIK.txt komplett in das bestehende Apps-Script-Projekt uebernehmen.
2. setup() NICHT erneut ausfuehren.
3. Neue Apps-Script-Version bereitstellen.
4. PWA/App danach einmal vollstaendig neu laden (Strg+F5). Danach muss sichtbar Version 6.0 erscheinen.
