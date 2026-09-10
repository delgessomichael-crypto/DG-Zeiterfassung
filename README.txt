DG ZEITERFASSUNG v59

Aktueller Stand GitHub-PWA / Google-Apps-Script-Backend: Version 59.

Stabiler Basisstand aus v58:
- Automatische feste Pausenregel, Tages-/Wochen-/Monatsauswertung.
- Nachtraege nach Tagesabschluss mit Aktualisierung des bestehenden Tagesabschlusses.
- Regieberichte, Objektstatus, Fotoauswahl/ZIP und gemeinsame Abrechnung.
- Uebertragungsdatum fuer Mitarbeiter bzw. Datum/Uhrzeit im Buero.
- Stabilitaets- und Integritaetspruefungen aus v58.

Aenderungen in v59:
- Mitarbeiter: eigener Tageseintrag kann vor Tagesabschluss ueber den gruenen Button „Eintrag bearbeiten“ sachlich korrigiert werden.
- Zeitmanipulationsschutz: Datum, Von, Bis und Stunden sind beim Mitarbeiter immer gesperrt. Das Backend veraendert diese Werte auch bei manipulierten Requests nicht.
- Bearbeitbar sind Kunde/Baustelle, Taetigkeit, Material und Auftragsstatus. Eine vorhandene Kundenunterschrift bleibt unveraendert.
- Bereits abgerechnete Regieberichte koennen vom Mitarbeiter nicht mehr bearbeitet werden.
- „Eintrag loeschen“ ist durch eine eindeutige Ja/Nein-Sicherheitsabfrage abgesichert.
- Kalender Mitarbeiter: Heute ist standardmaessig offen; Morgen und Uebermorgen sind standardmaessig minimiert.
- Jeder Kalendertag ist separat auf-/zuklappbar und zeigt Datum sowie Anzahl der Termine.

Aktive Patch-Kette:
v45-patch.js, v48-patch.js, v49-patch.js, v50-patch.js, v51-patch.js, v53-finish.js, v54-patch.js, v55-patch.js, v56-patch.js, v57-patch.js, v58-patch.js, v59-patch.js

Service-Worker Cache: dg-zeiterfassung-v59-1

Wichtig: v59 benoetigt das zugehoerige Apps-Script-Backend v59. Nach dessen Bereitstellung die PWA vollstaendig neu laden bzw. mit ?v=59 oeffnen und auf „Version 59“ achten.
