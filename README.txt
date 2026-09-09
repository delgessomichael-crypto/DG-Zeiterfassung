DG ZEITERFASSUNG v55

Aktueller Stand GitHub-PWA / Google-Apps-Script-Backend: Version 55.

Basis aus v54:
- Feste automatische Pausenregel: ab 6,00 Brutto-Arbeitsstunden werden 1,00 Std. Pause abgezogen.
- Keine manuelle Pausenauswahl.
- Mitarbeiter sehen Tages-, Wochen- und Monatsstunden; Wochenzeit Montag bis Samstag.
- Baustellenbilder im Chefbereich als Galerie und markiert als ZIP herunterladbar.
- Lokale Status-/Verarbeitungshinweise.

Änderungen und Korrekturen in v55:
- Restfehler durch entferntes Feld pauseHours beseitigt.
- Mitarbeiter-Tagesanzeige zeigt nur noch „Heute: x Std.“ ohne Soll- und Reststunden.
- Nachträge nach bereits erfolgtem Tagesabschluss möglich, aber nur nach ausdrücklicher Bestätigung.
- Nachträge werden serverseitig mit Kennzeichen und Erfassungszeitpunkt gespeichert und in Mitarbeiter-/Chef-/Objektansichten kenntlich gemacht.
- Tages-, Wochen- und Monatsstunden werden nach einem Nachtrag aus der gesamten aktuellen Tageszeit neu berechnet; die automatische Pause greift dadurch auch nachträglich korrekt.
- Regieabrechnung zusammengefasster Objekt-IDs erfolgt als eine gemeinsame Aktion; ausgewählte Objekt-IDs blockieren sich bei der Sicherheitsprüfung nicht mehr gegenseitig.
- Laufende und abgeschlossene Regieberichte desselben Kunden werden getrennt gruppiert. „Auf laufend zurücksetzen“ erscheint dadurch zuverlässig unter „Laufende Aufträge“.
- Regie-Statusänderungen laden anschließend direkt den Zielbereich.

Aktive Patch-Kette:
v45-patch.js, v48-patch.js, v49-patch.js, v50-patch.js, v51-patch.js, v53-finish.js, v54-patch.js, v55-patch.js

Service-Worker Cache: dg-zeiterfassung-v55-1

Wichtig: v55 benötigt das zugehörige Apps-Script-Backend v55. Nach dessen Bereitstellung die PWA vollständig neu laden bzw. mit ?v=55 öffnen und auf „Version 55“ achten.
