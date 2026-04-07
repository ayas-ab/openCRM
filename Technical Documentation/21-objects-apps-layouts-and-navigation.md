# Objects, Apps, Layouts, and Navigation

**Section:** 20 Architecture

[Previous: Metadata Platform](./20-metadata-platform.md) | [Index](./01-index.md) | [Next: Record Lifecycle](./22-record-lifecycle.md)

## Objects

Objects are defined by `ObjectDefinition`.

Each object has:

- identity: `apiName`, `label`, `pluralLabel`, `icon`
- fields: `FieldDefinition`
- behavior flags: `notifyOnAssignment`, `enableChatter`
- metadata children: rules, list views, layouts, imports, widgets

Seeded system objects include:

- `user`
- `company`
- `contact`
- `opportunity`
- `case`

Custom objects use the same engine.

## Apps

Apps are workspace containers defined by `AppDefinition`.

Each app has:

- branding and identity
- navigation items via `AppNavItem`
- dashboard widgets via `DashboardWidget`
- app access grants via `AppPermission`

`AppNavItem.sortOrder` controls the object order shown in the standard app header/sidebar navigation.

In the standard UI, users only see apps granted through permission sets.

## Layouts

Record pages are defined by `RecordPageLayout`.

Selection order is:

1. app-specific assignment
2. permission-set-specific assignment within that app
3. default layout fallback

Visibility rules can hide sections and fields dynamically based on form values and permission context.

Implementation:

- `src/lib/record-page-layout.ts`
- `src/actions/admin/record-page-actions.ts`

## Navigation

Standard navigation is app-scoped:

- header app switcher
- app sidebar object list
- object list page
- record detail page

Admin navigation is capability-scoped and points to metadata management surfaces.

Implementation:

- `src/app/(standard)/app/[appApiName]/layout.tsx`
- `src/components/standard/layout/standard-sidebar.tsx`
- `src/components/standard/layout/app-header.tsx`
- `src/components/admin/layout/admin-sidebar.tsx`

---

[Previous: Metadata Platform](./20-metadata-platform.md) | [Index](./01-index.md) | [Next: Record Lifecycle](./22-record-lifecycle.md)
