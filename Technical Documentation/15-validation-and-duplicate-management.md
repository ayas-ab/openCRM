# Validation and Duplicate Management

**Section:** 10 Product

[Previous: Assignment Rules and Notifications](./14-assignment-rules-and-notifications.md) | [Index](./01-index.md) | [Next: Data Import and AutoNumber](./16-data-import-and-autonumber.md)

These features help admins protect data quality without code changes.

## Validation Rules

Validation rules run on create and update.

They support:

- multiple conditions
- ALL logic
- ANY logic
- custom expressions
- inline field messages
- toast-level messages

Custom expressions are validated before save and reject malformed syntax, incomplete parentheses, and invalid condition references.

## Type-Aware Validation

Validation respects field types.

Examples:

- number operators stay type-specific
- `Date` comparisons use calendar-day semantics
- `DateTime` comparisons use timestamp semantics
- lookup conditions focus on blank and not-blank checks
- picklists use controlled operators and dropdown selection
- decimal-place rules are enforced for number fields

## TextArea and File Restrictions

Some field types are intentionally restricted.

- File fields cannot be used in validation criteria
- TextArea fields are limited to blank checks and character-length style conditions

## Duplicate Rules

Duplicate rules are separate from simple uniqueness.

They compare multiple fields together and can behave differently during:

- create
- edit
- import

When duplicate rules use custom logic, the expression is validated before save with the same numbered-condition syntax rules used by other metadata builders.

Temporal duplicate behavior:

- duplicate rules continue to use `Date` fields as date-only keys
- duplicate rules do not use `DateTime` fields

## Duplicate Actions

- warn
- block

Warn means the user can continue after review.

Block means the save must fail.

## Import Meaning

During import:

- blocking duplicate matches fail the row
- warning duplicate matches still import but are clearly reported

## Product Value

Validation rules keep the data valid.

Duplicate rules keep the data trustworthy.

---

[Previous: Assignment Rules and Notifications](./14-assignment-rules-and-notifications.md) | [Index](./01-index.md) | [Next: Data Import and AutoNumber](./16-data-import-and-autonumber.md)
