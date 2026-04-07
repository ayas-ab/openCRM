# Objects and Fields

**Section:** 10 Product

[Previous: Admin and Security Model](./07-admin-and-security-model.md) | [Index](./01-index.md) | [Next: Apps and Dashboards](./09-apps-and-dashboards.md)

This note covers the product-facing behavior of the custom object and field system.

## Core Idea

openCRM lets admins define new business entities at runtime rather than depending on hardcoded tables for every use case.

Examples:

- properties
- vehicles
- projects
- vendors

## Object Builder

For each object, admins can define:

- object name
- plural name
- API name
- icon
- description

The result is a first-class business object that can participate in:

- navigation
- forms
- record detail pages
- list views
- dashboards
- permissions

## Field Types

Supported field types:

- Text
- TextArea
- Number
- Date
- DateTime
- Checkbox
- Phone
- Email
- Url
- Lookup
- Picklist
- File
- AutoNumber

## Field Rules and Product Semantics

### Lookup

Lookups connect one record to another record.

Product rule:

- the lookup target is locked after creation

### Picklist

Picklists use normalized option rows.

This gives:

- stable option identity
- editable labels without rewriting all records
- active and inactive option states

### File

File fields support one attachment per field value.

Admins can control:

- allowed file types
- image display mode

### AutoNumber

AutoNumber creates human-friendly CRM IDs on save.

It uses:

- prefix
- padding
- starting number

No current backfill exists for older records if AutoNumber is added later.

### Date and DateTime

`Date` is for calendar-day business values such as birthdays, due dates, and renewal dates.

Product semantics:

- stored in the shared temporal value column
- normalized and compared as date-only
- rendered without time-of-day

`DateTime` is for timestamped events such as meetings and appointments.

Product semantics:

- stored in the same shared temporal value column
- preserves time-of-day
- compared as a full timestamp
- rendered with date and time

## External ID

One text field per object can be marked as External ID.

External IDs are important for:

- import matching
- update and upsert logic
- lookup resolution during import

## List View Impact

The object and field model also controls what is eligible for fast list behavior.

TextArea and File fields are intentionally excluded from list-centric features such as:

- list columns
- list filters
- list sorting

## Safe Delete

Objects and fields cannot be deleted if they are still referenced by metadata elsewhere in the product.

That protects:

- layouts
- rules
- dashboards
- list views
- app navigation

## Related Notes

- [List Views](./10-list-views.md)
- [Apps and Dashboards](./09-apps-and-dashboards.md)
- [Metadata Platform](./20-metadata-platform.md)

---

[Previous: Admin and Security Model](./07-admin-and-security-model.md) | [Index](./01-index.md) | [Next: Apps and Dashboards](./09-apps-and-dashboards.md)
