# DG App 10 – Railway migration

This branch is intentionally separate from the production 9.0 branch.

## Phase 1
Host an exact 1:1 mirror of the final 9.0 UI on Railway while continuing to use Google-GS 9.0 for all existing business data, Gmail polling and Google Calendar integration.

No production data is copied, modified or deleted in this phase.

## Migration rule
The existing 9.0 app remains the production system until:
1. the Railway mirror is functionally identical,
2. a PostgreSQL schema exists,
3. all Google-backed business data has been exported and imported,
4. record counts and checksums have been reconciled,
5. a controlled cutover has been approved.

Google Calendar and mail-driven customer inquiries remain Google-based initially.
