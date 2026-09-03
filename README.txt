DG ZEITERFASSUNG v30

Änderungen gegenüber v29:
- Ausstehende Offline-Übertragungen sind für Mitarbeiter sichtbar.
- Details zeigen Kunde/Auftrag, Datum, Uhrzeit, Stunden und Tätigkeit.
- Einzelne ausstehende Aufträge können manuell erneut übertragen werden.
- Zusätzlich gibt es "Alle jetzt übertragen".
- Netzwerkfehler und Backend-/Datenfehler werden getrennt behandelt.
- Nur echte Netzwerkfehler werden automatisch in die Offline-Warteschlange gelegt.
- Bei Backend-/Datenfehlern bleibt das Formular erhalten und die konkrete Servermeldung wird angezeigt.
- Bestehende IndexedDB-Warteschlange aus v29 bleibt erhalten.
- Sichtbare Versionsnummer: Version 30.
- Service-Worker Cache: dg-zeiterfassung-v30.

Installation:
1. GitHub index.html ersetzen.
2. GitHub sw.js ersetzen.
3. Backend ist gegenüber v29 unverändert; keine neue Apps-Script-Bereitstellung erforderlich, wenn v29-Backend bereits aktiv ist.
4. App mit ?v=30 öffnen und auf "Version 30" achten.
