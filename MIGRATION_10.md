# DG App 10 – Railway migration

This branch is intentionally separate from the production 9.0 branch.

## Current status — 2026-09-21

Production 9.0 remains untouched. Railway/PostgreSQL is the migration target.

Migration snapshot:
- 35 sheets
- 884 source rows
- 884 imported rows
- 0 row-count mismatches

Native PostgreSQL direct reads currently enabled:
- employee master/admin read
- manual orders
- own reminders
- offer reminders
- planner workers
- current planner availability week
- absences, sickness alerts and 2026 absence overviews
- maintenance customer/search/contracts/overview/archive/device IDs
- vacation 2026
- time bank
- current employee day/week/month data
- current boss day closures
- payroll cycle/status
- standard Regie open/billed views
- 69 object report histories
- offer reports: To create / Open / Archive
- offer statistics
- office dashboard

Guarded / query-verified reads:
- Regie billing-risk checks
- customer-specific/object-query variants not prebootstrapped
- native boss-month view (must first match Google 1:1)
- payroll audit (Google Calendar checks for flexible/minijob employees remain authoritative)

Google remains intentionally authoritative initially for:
- Google Calendar synchronization / external calendar operations
- Gmail/mail-driven customer inquiry acquisition
- payroll checks that require live Google Calendar data
- export/file actions that depend on Google Drive/Gmail

## Safety rule

A native PostgreSQL view is only used directly when its readiness key is verified. After relevant writes, affected readiness keys are invalidated; the next read can fall back to Google, compare the result, and only then re-enable the native path.

## Cutover rule

The existing 9.0 app remains the production system until:
1. the Railway mirror is functionally identical,
2. PostgreSQL-backed reads/writes have been reconciled,
3. remaining Google dependencies are intentionally retained or replaced,
4. record counts and checksums remain clean,
5. office and employee workflows pass acceptance testing,
6. a controlled cutover is approved.


## Progress update — 2026-09-21 07:43 CEST

Additional native Railway/PostgreSQL paths:
- office system health check
- native payroll audit implemented with guarded Google comparison
- native boss-month calculation implemented with guarded Google comparison

Current intentional Google-bound reads:
- employee calendar events
- planner events that merge external Google Calendar entries
- maintenance attachment/file retrieval from Google Drive

The boss-month and payroll-audit native paths remain locked until the first September 2026 Google result is observed and matches PostgreSQL exactly. Opening those views once in the app is sufficient to trigger the comparison.


## Progress update — 2026-09-21 13:05 CEST

PostgreSQL-first writes now include:
- own reminder note / reschedule / complete / delete
- object internal notes
- payroll issue review and conflict review
- manual order create/update/status/note/delete where a stable ID exists
- customer inquiry note/contact/complete/archive
- inquiry reminder reopen/archive
- offer reminder reschedule
- monthly adjustment delete
- vacation entitlement update
- employee active/inactive
- planner worker active/inactive
- Regie job status (Laufend/Abgeschlossen)
- employee assignment confirmation / issue report

Write safety:
- successful local writes are queued to the encrypted legacy Google outbox
- stale Google exact-view snapshots are removed after local writes without discarding validated native PostgreSQL algorithms
- extended manual-order offer statuses are mirrored to the currently deployed Google backend via saveManualOrder, so they do not depend on a new Apps Script deployment
- ID-generating writes remain Google-first until an idempotent cross-system ID strategy is available
- Drive/calendar side-effect writes remain Google-first

Current health remains:
- 35 sheets
- 884 source rows / 884 imported rows
- 0 migration mismatches
- legacy outbox currently empty


## Progress update — 2026-09-22 06:18 CEST

Additional migration fixes:
- customer inquiries and inquiry reminders are now routed through the PostgreSQL direct-read router when their freshness/readiness guard passes
- manual orders reconciled against the latest confirmed Google response: 12 Google / 12 PostgreSQL / 0 mismatches
- two missing manual-order records were restored into PostgreSQL and one stale status was reconciled
- future-month employee month views are no longer allowed to create readiness mismatches before the month starts; they remain on guarded fallback until current
- current verified mismatch inventory after reconciliation: no current-month mismatch; only the pre-existing future October test mismatch was identified and is being removed by the future-month guard

Intentional Google dependencies remain:
- employee login/PIN authority
- Gmail-driven inquiry acquisition
- live Google Calendar operations and calendar-sensitive payroll checks
- Google Drive/Gmail side-effect file/export actions


## Near-final status — 2026-09-22

Current production API commit: `f6ae3ef`.

Completed performance/migration hardening:
- frontend `ping` is handled locally by Railway instead of proxying to Google
- employee admin, manual orders, own reminders, offer reminders and planner workers are PostgreSQL-authoritative reads
- absences and sickness alerts are direct PostgreSQL reads and health output now reflects that correctly
- maintenance overview, maintenance contracts and internal object notes are PostgreSQL-authoritative reads
- customer inquiries and inquiry reminders use guarded PostgreSQL direct reads with Gmail/Google retained as acquisition source
- manual orders reconciled to 12/12 with 0 mismatches
- migration remains 884/884 imported rows with 0 migration mismatches
- verification mismatch inventory was cleaned to 0 current mismatches
- future-month month-data verification is intentionally excluded from readiness until that month is current

Intentional Google dependencies retained:
- employee login/PIN authority
- Gmail acquisition of new customer inquiries
- live Google Calendar / external calendar event operations
- Drive/file upload and export side effects
- future-month employee month view when Google contains future records not yet represented in PostgreSQL
- first-use comparison for boss-month and payroll-audit native views until a current Google snapshot exists

Operational state at this checkpoint:
- legacy outbox pending=0, failed=0
- Railway API deployment successful
- database readiness OK
- core current-period PostgreSQL reads verified and active
