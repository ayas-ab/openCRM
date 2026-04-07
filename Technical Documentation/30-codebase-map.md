# Codebase Map

**Section:** 80 Codebase

[Previous: Runtime and Route Map](./29-runtime-and-route-map.md) | [Index](./01-index.md) | [Next: Guardrails](./31-guardrails.md)

This note maps major responsibilities to concrete files.

## Top-Level Source Areas

- `src/actions`: server actions grouped by admin vs standard flows
- `src/app`: Next.js app router surfaces for auth, standard app, admin app, and APIs
- `src/components`: UI surfaces and builders
- `src/jobs`: long-running worker entrypoints
- `src/lib`: reusable domain, access, metadata, and runtime helpers
- `src/tests`: unit-level test coverage and test utilities

## Auth and Request Boundary

- `src/auth.ts`
- `src/proxy.ts`

## Standard Data Flows

- `src/actions/standard/record-actions.ts`
- `src/actions/standard/list-view-actions.ts`
- `src/actions/standard/dashboard-actions.ts`
- `src/actions/standard/import-actions.ts`
- `src/actions/standard/comment-actions.ts`
- `src/actions/standard/lookup-actions.ts`

## Admin Metadata and Governance

- `src/actions/admin/admin-actions.ts`
- `src/actions/admin/user-actions.ts`
- `src/actions/admin/permission-actions.ts`
- `src/actions/admin/queue-actions.ts`
- `src/actions/admin/group-actions.ts`
- `src/actions/admin/assignment-rule-actions.ts`
- `src/actions/admin/sharing-rule-actions.ts`
- `src/actions/admin/duplicate-rule-actions.ts`
- `src/actions/admin/record-page-actions.ts`

These files are the main write surface for metadata administration.

## Security and Access Helpers

- `src/lib/permissions.ts`
- `src/lib/record-access.ts`
- `src/lib/sharing-rule-recompute.ts`

These are the primary access-control and materialized-sharing helpers.

## Metadata and Layout Helpers

- `src/lib/metadata-dependencies.ts`
- `src/lib/record-page-layout.ts`
- `src/lib/list-views.ts`
- `src/lib/list-view-expression.ts`

These files are the key metadata-runtime helpers for safe delete, list-view evaluation, and record-page visibility.

## Validation and Duplicate Logic

- `src/lib/validation/record-validation.ts`
- `src/lib/validation/rule-logic.ts`
- `src/lib/duplicates/duplicate-rules.ts`
- `src/lib/unique.ts`

Use these first when the task involves save-time validation, custom logic parsing, duplicate detection, or uniqueness behavior.

## Data and File Helpers

- `src/lib/db.ts`
- `src/lib/field-data.ts`
- `src/lib/file-storage.ts`
- `src/lib/auto-number.ts`
- `src/lib/user-companion.ts`

`src/lib/db.ts` is the Prisma client anchor used across the app.

## Async Jobs

- `src/lib/jobs/pgboss.ts`
- `src/lib/jobs/import-jobs.ts`
- `src/lib/jobs/sharing-rule-jobs.ts`
- `src/jobs/sharing-rule-worker.ts`

## Seed and Registration

- `src/actions/auth.ts`
- `src/actions/admin/seed-demo-data.ts`
- `src/lib/seeding/create-org-template.ts`

## Main UI Entry Points

- `src/app/(standard)/app/[appApiName]/layout.tsx`
- `src/app/(standard)/app/[appApiName]/[objectApiName]/page.tsx`
- `src/app/(standard)/app/[appApiName]/[objectApiName]/[recordId]/page.tsx`
- `src/app/(admin)/layout.tsx`
- `src/app/(admin)/admin/page.tsx`
- `src/components/admin/layout/admin-shell.tsx`
---

[Previous: Runtime and Route Map](./29-runtime-and-route-map.md) | [Index](./01-index.md) | [Next: Guardrails](./31-guardrails.md)
