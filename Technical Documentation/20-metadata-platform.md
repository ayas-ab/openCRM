# Metadata Platform

**Section:** 20 Architecture

[Previous: System Overview](./19-system-overview.md) | [Index](./01-index.md) | [Next: Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md)

The app is metadata-driven. Most of the product is defined by metadata rows, not hardcoded table-per-object design.

## Metadata Artifacts

- `ObjectDefinition`
- `FieldDefinition`
- `PicklistOption`
- `ValidationRule` and `ValidationCondition`
- `DuplicateRule` and `DuplicateRuleCondition`
- `AssignmentRule`
- `SharingRule`
- `ListView`, `ListViewColumn`, `ListViewShare`
- `RecordPageLayout`, `RecordPageAssignment`
- `AppDefinition`, `AppNavItem`, `DashboardWidget`
- `MetadataDependency`

## Why This Matters

This metadata controls:

- navigation
- form generation
- record detail layout
- search and list behavior
- validation
- duplicate detection
- assignment behavior
- sharing behavior
- safe deletion

## Safe Delete Model

Delete safety is not optional. If metadata stores a reference to another object or field, that reference must be indexed in `MetadataDependency`.

The dependency index is used to:

- block unsafe object deletion
- block unsafe field deletion
- explain where a dependency exists
- support dependency rebuilds

Primary implementation:

- `src/lib/metadata-dependencies.ts`

## Important Guardrails

- metadata is tenant-scoped
- metadata is security-sensitive
- metadata references must be validated against the same org
- new metadata features must join the dependency index

## Related Notes

- [Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md)
- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Data Model and Prisma Map](./27-data-model-and-prisma-map.md)

---

[Previous: System Overview](./19-system-overview.md) | [Index](./01-index.md) | [Next: Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md)
