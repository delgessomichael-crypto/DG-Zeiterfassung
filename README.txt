DG ZEITERFASSUNG v54

Aktueller Stand GitHub-PWA / Google-Apps-Script-Backend: Version 54.

Änderungen in v54:
- Feste automatische Pausenregel: ab 6,00 Brutto-Arbeitsstunden werden 1,00 Std. Pause abgezogen.
- Manuelle Pausenauswahl im Mitarbeiter-Tagesabschluss entfällt.
- Mitarbeiter sehen geleistete Wochenstunden für Montag bis Samstag.
- Soll-/Reststundenhinweis im Tagesfeld der Mitarbeiteransicht entfällt; geleistete Zeit wird grün dargestellt.
- Chefbereich zeigt automatische Pause zur Nachvollziehbarkeit separat an.
- Regieberichte: Baustellenbilder als Galerie ansehen, standardmäßig alle markiert, einzelne Bilder abwählbar.
- Markierte Baustellenbilder können gemeinsam als ZIP heruntergeladen werden.
- Fehler bei der Abrechnungsprüfung (`toDateString_ is not defined`) im Backend behoben.
- Verarbeitungshinweise werden zusätzlich direkt im aktuellen Arbeitsbereich angezeigt.
- Versionsstände auf v54 vereinheitlicht.

Aktive Patch-Kette:
v45-patch.js, v48-patch.js, v49-patch.js, v50-patch.js, v51-patch.js, v53-finish.js, v54-patch.js

Service-Worker Cache: dg-zeiterfassung-v54-1

Wichtig: v54 benötigt das zugehörige Apps-Script-Backend v54. Nach dessen Bereitstellung die PWA neu laden bzw. mit ?v=54 öffnen.
