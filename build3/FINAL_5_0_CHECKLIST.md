# DG Zeiterfassung 5.0 – Finalcheck

- Frontend-Version: 5.0
- Backend-Zielstand: Google GS 5.0
- Ausgelieferte Bundles: app-5.0.js / app-5.0.css
- Service-Worker-Cache: dg-zeiterfassung-5-0
- Mitarbeiterkalender: Wartungs-Metadaten werden aus der sichtbaren Beschreibung entfernt; Geräte-ID bleibt separat sichtbar.
- Regieberichte: Wartungen zeigen Geräte-ID, nächste Wartung, Rechnungsempfänger und Ausführungsort aus dem Wartungsstamm.
- Wartungsverträge: zusätzlicher Reiter Alle Kunden, alphabetisch, mit direktem Sprung in den vollständigen Kundendatensatz.
- Hintergrund-Sync im Büro aktualisiert nur Zähler und ersetzt keine geöffneten Formulare/Untermenüs.
- Wartungstestdaten wurden vor dem Produktivstart entfernt; leerer Wartungsstamm beginnt mit Geräte-ID 1000.
- CI prüft JS/SW-Syntax, Versionskonsistenz und zentrale 5.0-Funktionen.
