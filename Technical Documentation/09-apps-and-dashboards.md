# Apps and Dashboards

**Section:** 10 Product

[Previous: Objects and Fields](./08-objects-and-fields.md) | [Index](./01-index.md) | [Next: List Views](./10-list-views.md)

Apps are curated workspaces built for teams or workflows.

## App Definition

An app includes:

- name
- icon or branding
- description
- object navigation
- ordered object navigation
- dashboard widgets
- permission-set based assignment

## Why Apps Exist

Apps let the same CRM platform feel different for different teams.

Examples:

- a sales team sees opportunity-oriented navigation
- a support team sees case-oriented navigation
- an operations team sees custom objects and workflow-specific widgets

## Dashboards

Each app can have a dashboard.

The dashboard is meant to act as the landing experience of the app.

## Widget Types

### Metric Widgets

Useful for:

- total open cases
- total pipeline amount
- average score

### List Widgets

Useful for:

- recent cases
- high-priority opportunities
- records matching a saved layout

### Chart Widgets

Useful for:

- pipeline by stage
- cases by status
- distribution by picklist value

## Widget Rules

- filters are typed
- custom filter expressions use numbered conditions and are rejected if malformed or incomplete
- owner scope can be all, mine, or queue-specific
- TextArea and File fields are excluded from filter use
- `Date` widget filters compare by calendar day
- `DateTime` widget filters compare by full timestamp
- list widgets can show created and modified date columns
- widgets carry an accent color and the builder normalizes missing or invalid values to a default color before save

## UX Direction

The dashboard is not just reporting. It is intended to be an action-oriented launch surface for the app.

---

[Previous: Objects and Fields](./08-objects-and-fields.md) | [Index](./01-index.md) | [Next: List Views](./10-list-views.md)
