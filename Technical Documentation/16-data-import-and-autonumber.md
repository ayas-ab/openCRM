# Data Import and AutoNumber

**Section:** 10 Product

[Previous: Validation and Duplicate Management](./15-validation-and-duplicate-management.md) | [Index](./01-index.md) | [Next: Business Logic and User Experience](./17-business-logic-and-user-experience.md)

This note covers two important operational features from the product perspective.

## Bulk Import

Bulk import is available from object list pages when the user has:

- Data Loading system permission
- the appropriate create and or edit rights

## Import Modes

- Insert
- Update
- Upsert

## External ID Requirement

Import depends on the object having an External ID field.

That field is used for:

- matching existing records
- deciding create vs update
- resolving lookups

## Lookup Resolution

Lookup values resolve through the target object’s External ID rather than internal record IDs.

## Guardrails

- file size limit
- row limit
- file fields excluded
- duplicate rules enforced
- per-row result tracking

## AutoNumber

AutoNumber gives records user-friendly system IDs.

Examples:

- `CASE-0001`
- `TKT-0042`

It is:

- generated on create
- read-only in the UI
- configured by prefix, padding, and starting number

## Current Limitation

If AutoNumber is added to an existing object later, existing records are not backfilled.

---

[Previous: Validation and Duplicate Management](./15-validation-and-duplicate-management.md) | [Index](./01-index.md) | [Next: Business Logic and User Experience](./17-business-logic-and-user-experience.md)
