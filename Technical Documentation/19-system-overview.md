# System Overview

**Section:** 20 Architecture

[Previous: Business Logic and User Experience](./17-business-logic-and-user-experience.md) | [Index](./01-index.md) | [Next: Metadata Platform](./20-metadata-platform.md)

openCRM is a lightweight CRM platform with Salesforce-style flexibility built around runtime metadata instead of fixed relational columns per business object.

## Core Idea

The product stores all business records in one universal `Record` table and stores typed field values in `FieldData`.

That gives the app:

- custom objects without schema migrations
- custom fields at runtime
- typed filtering and sorting
- dashboards and list views over custom data
- lookup relationships between arbitrary objects

## Main Product Areas

- CRM records and custom objects
- apps and dashboards
- list views and kanban
- validation rules
- duplicate rules
- assignment rules
- sharing rules
- queues and groups
- comments and mentions
- field and owner history
- bulk import
- protected file attachments

## Main Runtimes

- Next.js web app for request-time UI, reads, writes, and APIs
- pg-boss worker for asynchronous sharing recompute and imports
- PostgreSQL for tenant data, metadata, access state, and job queue schema
- local filesystem storage for uploaded files

## Top-Level Architecture

- [Metadata Platform](./20-metadata-platform.md)
- [Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md)
- [Record Lifecycle](./22-record-lifecycle.md)
- [Imports, Jobs, and Files](./23-imports-jobs-and-files.md)
- [User Types and Access Model](./25-user-types-and-access-model.md)
- [Data Model and Prisma Map](./27-data-model-and-prisma-map.md)

## Implementation Anchors

- `src/actions/standard/record-actions.ts`
- `src/actions/admin/admin-actions.ts`
- `src/actions/admin/user-actions.ts`
- `src/lib/import-processing.ts`
- `src/lib/sharing-rule-recompute.ts`

## Important Non-Obvious Behavior

- Core CRM objects are pre-seeded custom objects, not a separate engine.
- The `User` object uses a companion-record model and is partially protected from normal CRUD semantics.
- Record shares are materialized rows in `RecordShare`, not computed ad hoc at read time.
- Queue membership grants read access only, never edit or delete.
- Duplicate rules may inspect records the acting user cannot read, but must not leak hidden record details.

---

[Previous: Business Logic and User Experience](./17-business-logic-and-user-experience.md) | [Index](./01-index.md) | [Next: Metadata Platform](./20-metadata-platform.md)
