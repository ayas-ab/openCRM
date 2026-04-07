# Human Product Overview

**Section:** 10 Product

[Previous: Technical Documentation](./01-index.md) | [Index](./01-index.md) | [Next: Product Overview](./03-product-overview.md)

This is the short human-readable overview for the current implemented product.

Use this note when you want to understand what openCRM is without reading the full technical set.

## What openCRM Is

openCRM is a multi-tenant, metadata-driven CRM built around a universal `Record` plus typed `FieldData` model.

The product combines:

- standard CRM-style objects
- runtime-defined custom objects and fields
- app-based navigation and dashboards
- row-level access through ownership, queues, groups, and materialized shares

## Current Core Model

The repo currently treats these as the built-in system objects:

- `Company`
- `Contact`
- `Opportunity`
- `Case`
- `User`

The demo data may also seed other objects such as `Project`, `Epic`, `Issue`, `Patient`, `Appointment`, and `Provider`, but those are seeded examples rather than the core system-object set.

## How Customization Works

Admins can define objects, fields, list views, record page layouts, apps, widgets, validation rules, duplicate rules, assignment rules, and sharing rules through the metadata layer.

This is not a table-per-object CRM. The schema stays stable while metadata defines new business entities at runtime.

## Access Model In Practice

Object permission is checked first.

Only after that does the app evaluate row-level access through:

1. `View All` or `Modify All`
2. direct user ownership
3. queue membership for read-only queue access
4. direct or group-based `RecordShare`

Important repo-truth behavior:

- admin users are not implicit data superusers in standard app flows
- queue membership alone does not grant edit or delete
- sharing rules materialize access only for user-owned records, not queue-owned records

## Current Major Product Surfaces

- standard CRM record flows in `/app`
- admin metadata/configuration flows in `/admin`
- apps with one dashboard per app
- saved list views with custom filter logic
- record page layouts with visibility rules
- validation, duplicate, assignment, and sharing rule engines
- global search across readable records
- import jobs using external IDs

## Current Data Behavior Worth Knowing

- record deletion is a hard delete in the current implementation
- inbound lookups to a deleted record are cleared rather than left pointing at dead IDs
- files are supported in the data model and runtime, but not every seeded demo org uses them
- the `User` object is special and cannot be treated like generic record CRUD

## Read Next

- [Human Access and Ownership Guide](./24-human-access-and-ownership-guide.md)
- [Product Overview](./03-product-overview.md)
- [System Overview](./19-system-overview.md)
- [Data Model and Prisma Map](./27-data-model-and-prisma-map.md)

---

[Previous: Technical Documentation](./01-index.md) | [Index](./01-index.md) | [Next: Product Overview](./03-product-overview.md)
