# Assignment Rules and Notifications

**Section:** 10 Product

[Previous: Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md) | [Index](./01-index.md) | [Next: Validation and Duplicate Management](./15-validation-and-duplicate-management.md)

This note covers automatic work routing and the user-facing notification behavior tied to it.

## Assignment Rules

Assignment rules run only on record creation.

They:

- evaluate criteria in priority order
- stop at the first match
- assign to either a user or a queue

## User Assignment

When assigned to a user:

- the record becomes user-owned
- the product may notify the user if the object allows assignment notifications

## Queue Assignment

When assigned to a queue:

- the record becomes queue-owned
- queue members receive notifications
- the record remains read-only until claimed or reassigned

## Criteria Eligibility

To keep assignment logic predictable:

- TextArea and File fields are excluded
- picklists use restricted operators

## Notifications

Notifications currently support:

- queue assignment
- user assignment
- comment mentions

Notifications appear in the app header so users can respond quickly to new work or discussion.

---

[Previous: Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md) | [Index](./01-index.md) | [Next: Validation and Duplicate Management](./15-validation-and-duplicate-management.md)
