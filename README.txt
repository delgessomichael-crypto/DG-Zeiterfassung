DG ZEITERFASSUNG - ARBEITSSTAND v25
Stand: 03.09.2026

Aenderungen v25:
- Auswahl "Weitere Mitarbeiter" aus der Mitarbeiteransicht entfernt.
- Jeder Mitarbeiter erfasst kuenftig ausschliesslich seine eigenen Stunden.
- Neue Eintraege erzeugen keine Mitarbeiterzuordnungen mehr.
- Chefbereich Regieberichte gruppiert automatisch nach Objekt-ID.
- Pro Objekt werden Gesamtstunden aller Mitarbeiter, beteiligte Mitarbeiter und Anzahl der Berichte angezeigt.
- Einzelberichte bleiben aufklappbar mit Taetigkeit, Material, Bildern und Unterschrift.
- "Objekt als abgerechnet markieren" markiert alle aktuell offenen Regieberichte dieses Objekts gemeinsam als abgerechnet.
- Objekt-ID wird automatisch im Hintergrund vergeben; keine Eingabe durch Mitarbeiter notwendig.
- Historische v22/v24 Mitarbeiterzuordnungen bleiben fuer alte Daten erhalten, werden aber fuer neue Eintraege nicht mehr erzeugt.

Installation:
1. Code_FINAL_PWA_v25.txt komplett in Google Apps Script einsetzen.
2. Speichern.
3. updateExistingSheet() einmal ausfuehren (sicherer Migrationscheck).
4. Bestehende Web-App-Bereitstellung auf eine neue Version aktualisieren.
5. index.html im GitHub Repository ersetzen und committen.
6. App mit ?v=25 neu laden.
