DG ZEITERFASSUNG v56

Aktueller Stand GitHub-PWA / Google-Apps-Script-Backend: Version 56.

Basis aus v55:
- Automatische Pausenregel und Tages-/Wochen-/Monatsauswertung.
- Nachträge nach bereits erfolgtem Tagesabschluss mit dauerhafter Kennzeichnung.
- Regieberichte, Objektstatus und gemeinsame Abrechnung zusammengefasster Objekt-IDs.

Änderungen und Korrekturen in v56:
- Nachtrag-Workflow nach Tagesabschluss vollständig getrennt: Nachtrag erfassen -> Nachtrag speichern -> Tagesabschluss aktualisieren.
- Nach erfolgreichem Speichern erscheint eine eindeutige Erfolgsmeldung mit Hinweis, den Tagesabschluss anschließend über „Tag aktualisieren“ neu zu berechnen.
- „Nachtrag zu abgeschlossenem Tag erfassen“ ist rot hervorgehoben.
- „Tag aktualisieren“ ist grün hervorgehoben.
- Neue Nachträge werden zunächst als noch nicht erneut tagesabgeschlossen gespeichert; erst „Tag aktualisieren“ bestätigt sie im Tagesabschluss.
- Backend liefert closureNeedsRefresh und erkennt automatisch, ob seit dem letzten Tagesabschluss/Aktualisieren ein Nachtrag hinzugekommen ist.
- „Tag aktualisieren“ aktualisiert den bestehenden Tagesabschluss mit der aktuellen gesamten Tageszeit und der daraus neu berechneten automatischen Pause.
- Nachtrag erzeugt unmittelbar einen neuen offenen Regiebericht im Chefbereich; Rückgabe bestätigt supplementSaved/regieCreated.
- Doppelte lokale Verarbeitungshinweise im Nachtrag-Formular werden reduziert.

Aktive Patch-Kette:
v45-patch.js, v48-patch.js, v49-patch.js, v50-patch.js, v51-patch.js, v53-finish.js, v54-patch.js, v55-patch.js, v56-patch.js

Service-Worker Cache: dg-zeiterfassung-v56-1

Wichtig: v56 benötigt das zugehörige Apps-Script-Backend v56. Nach dessen Bereitstellung die PWA vollständig neu laden bzw. mit ?v=56 öffnen und auf „Version 56“ achten.
