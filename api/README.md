# DG App 10 API

Phase 2 migration service.

Current rules:
- The existing Google-GS 9.0 remains the production data source.
- Google Calendar remains on Google.
- Mail/customer inquiry sync remains on Google.
- PostgreSQL is shadow-only until data parity has been verified.
- No destructive migration is performed by this service.

Endpoints:
- GET /health
- GET /v1/migration/counts (protected)
- POST /v1/migration/shadow (protected)
