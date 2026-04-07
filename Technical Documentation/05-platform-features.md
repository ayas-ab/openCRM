# Platform Features

**Section:** 10 Product

[Previous: Product Overview](./03-product-overview.md) | [Index](./01-index.md) | [Next: Core CRM Modules](./06-core-crm-modules.md)

This note describes the product-facing features that turn openCRM from a basic contact manager into a configurable CRM platform.

## Custom Objects and Fields

Admins can define new business entities at runtime.

Examples:

- properties
- vehicles
- projects
- subscriptions

Field types include:

- text
- textarea
- number
- date
- checkbox
- phone
- email
- url
- lookup
- picklist
- file
- auto number

## Apps

Admins can create focused workspaces for teams or workflows.

An app controls:

- branding
- object navigation
- dashboard widgets
- app access through permission sets

## List Views

Every object can have saved list views with:

- filters
- custom logic
- columns
- sorting
- sharing
- favorites and pins
- personal defaults

## Dashboards

Apps can have dashboards with:

- metric widgets
- list widgets
- chart widgets

These respect permissions and record visibility.

## Validation Rules

Validation rules help keep data clean before save.

They support:

- multiple conditions
- typed comparisons
- custom logic expressions
- inline or toast-style errors

## Duplicate Rules

Duplicate rules help prevent accidental duplicate data.

They can:

- warn and allow continuation
- block the save entirely

They also run during imports.

## Assignment Rules

Assignment rules run when records are created and can route records to:

- a user
- a queue

The first matching rule wins.

## Sharing Rules

Sharing rules grant group access to user-owned records based on criteria.

These are used to make row-level visibility work beyond direct ownership.

## Comments and Notifications

The product supports:

- comments on records
- `@mentions`
- assignment notifications
- queue notifications

## Imports

Users with the right permissions can bulk:

- insert
- update
- upsert

Imports depend on external IDs and support lookup resolution by external ID.

---

[Previous: Product Overview](./03-product-overview.md) | [Index](./01-index.md) | [Next: Core CRM Modules](./06-core-crm-modules.md)
