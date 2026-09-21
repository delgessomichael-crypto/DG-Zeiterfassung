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
