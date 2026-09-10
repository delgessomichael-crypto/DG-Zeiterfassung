DG ZEITERFASSUNG v60

Aktueller Stand GitHub-PWA / Google-Apps-Script-Backend: Version 60.

Stabiler Basisstand aus v59:
- Automatische feste Pausenregel, Tages-/Wochen-/Monatsauswertung.
- Nachtraege nach Tagesabschluss mit Aktualisierung des bestehenden Tagesabschlusses.
- Regieberichte, Objektstatus und gemeinsame Abrechnung.
- Mitarbeiter-Eintraege vor Tagesabschluss sachlich bearbeitbar; Datum/Von/Bis/Stunden fuer Mitarbeiter dauerhaft gesperrt.
- Kalender Mitarbeiter: Heute offen, Morgen/Uebermorgen separat minimierbar.

Aenderungen in v60:
- Chefbereich Regieberichte: bisheriger Bilder-ZIP-Download wird zum vollstaendigen Berichtsexport.
- Button heisst jetzt „Bericht herunterladen“.
- ZIP enthaelt automatisch eine Regiebericht-PDF, vorhandene Kundenunterschrift(en) und die ausgewaehlten Baustellenbilder.
- Bilder bleiben einzeln abwaehlbar; PDF und Kundenunterschrift werden automatisch beigefuegt.
- Die PDF enthaelt Kunde/Baustelle, Datum, Mitarbeiter, Von/Bis, Stunden, Taetigkeit, Material und Auftragsstatus.
- Der Uebertragungszeitpunkt wird bewusst nicht in die Kunden-PDF aufgenommen.
- Auch Regieberichte ohne Baustellenbilder koennen als Bericht mit PDF und ggf. Kundenunterschrift heruntergeladen werden.
- Backend prueft, dass angeforderte Bilder zum ausgewaehlten Objekt/Regiebericht gehoeren.

Aktive Patch-Kette:
v45-patch.js, v48-patch.js, v49-patch.js, v50-patch.js, v51-patch.js, v53-finish.js, v54-patch.js, v55-patch.js, v56-patch.js, v57-patch.js, v58-patch.js, v59-patch.js, v60-patch.js

Service-Worker Cache: dg-zeiterfassung-v60-1

Wichtig: v60 benoetigt das zugehoerige Apps-Script-Backend v60. Nach dessen Bereitstellung die PWA vollstaendig neu laden bzw. mit ?v=60 oeffnen und auf „Version 60“ achten.
