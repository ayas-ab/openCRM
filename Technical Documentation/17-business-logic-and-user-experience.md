# Business Logic and User Experience

**Section:** 10 Product

[Previous: Data Import and AutoNumber](./16-data-import-and-autonumber.md) | [Index](./01-index.md) | [Next: System Overview](./19-system-overview.md)

This note captures the product behavior users experience in the app.

## Standard Area

The standard area is the day-to-day CRM workspace under `/app`.

It includes:

- app-based navigation
- object list pages
- record detail pages
- dashboards
- search
- notifications
- imports

Both standard and admin users can use this area.

## Admin Area

The admin area is the configuration backend under `/admin`.

It is used for:

- object and field setup
- app builder
- permission sets
- queues and groups
- validation and duplicate rules
- assignment and sharing rules
- user management

## Search Experience

Global search behaves like a command-style CRM search.

It:

- searches across readable objects
- ranks exact matches above partial matches
- links directly into records
- supports a dedicated full results page

## Record Pages

Record pages can show:

- highlights
- details sections
- related lists
- history
- chatter

The chosen layout depends on app and permission-set assignment.

## List Experience

List views are central to how users work with data.

Users can:

- switch views
- sort and paginate
- pin favorites
- set defaults
- work from tables or kanban when configured

## Ownership Experience

Users mostly work with records through ownership and visibility rules.

Typical patterns:

- work on your own records
- read queue-owned records if you belong to the queue
- claim queue work into personal ownership
- access shared records through group-based visibility

## Notifications Experience

Notifications appear in the app header and keep users aware of:

- new queue assignments
- user assignments
- mentions in comments

## Business Logic Theme

The user-facing logic of openCRM centers around a few concepts:

- metadata decides what exists
- permissions decide what actions are allowed
- ownership and sharing decide which records are visible
- layouts decide how records are presented
- validation, duplicate, assignment, and sharing rules decide what happens during save and downstream record handling

---

[Previous: Data Import and AutoNumber](./16-data-import-and-autonumber.md) | [Index](./01-index.md) | [Next: System Overview](./19-system-overview.md)
