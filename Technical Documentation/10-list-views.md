# List Views

**Section:** 10 Product

[Previous: Apps and Dashboards](./09-apps-and-dashboards.md) | [Index](./01-index.md) | [Next: Search and Navigation UX](./11-search-and-navigation-ux.md)

List views are a central productivity feature in openCRM.

## What A List View Does

A list view defines:

- which records appear
- how they are filtered
- how they are sorted
- which columns are visible
- who can access the view
- whether it is table or kanban

## User Experience

Users can:

- switch views
- pin favorites
- set personal defaults
- use settings and filter dialogs
- paginate through server-side results

## Filter Logic

List views support:

- ALL logic
- ANY logic
- custom expressions

Custom expressions:

- use numbered conditions such as `1 AND (2 OR 3)`
- are validated before save
- reject malformed parentheses, incomplete expressions, and out-of-range condition references

They also support owner scope filters such as:

- all records
- my records
- a specific queue

## Product Rules

TextArea and File fields are excluded from:

- columns
- filters
- sorting

That is a product decision as much as a technical one, because these field types do not behave well in dense list experiences.

Temporal filter semantics:

- `Date` filters compare by calendar day
- `DateTime` filters compare by full timestamp
- custom logic can mix temporal and non-temporal conditions, but the field type still controls comparison behavior

## Sharing Model

List views can be:

- global
- shared to groups
- shared to permission sets

## Kanban

When in kanban mode, the view groups records by a picklist field.

This gives users a stage- or status-driven working board while still using the same underlying list-view logic.

## Relationship To Dashboards

List widgets on dashboards reuse the list-view pipeline so users see consistent filtering, formatting, pagination, and sorting behavior across the product.

---

[Previous: Apps and Dashboards](./09-apps-and-dashboards.md) | [Index](./01-index.md) | [Next: Search and Navigation UX](./11-search-and-navigation-ux.md)
