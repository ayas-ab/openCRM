# Ownership, Queues, Groups, and Sharing

**Section:** 10 Product

[Previous: History, Record Pages, and Chatter](./12-history-record-pages-and-chatter.md) | [Index](./01-index.md) | [Next: Assignment Rules and Notifications](./14-assignment-rules-and-notifications.md)

This note is the business-facing version of the access model.

For technical enforcement details, see [Permissions and Record Access](./26-permissions-and-record-access.md).

## First Principle

Object permission is always checked before row-level visibility.

If a user lacks object access, ownership or sharing does not grant a bypass.

## Ownership

Every record has an owner.

The owner can be:

- a user
- a queue

Ownership is central to how work is organized and how visibility is determined.

## User-Owned Records

A user-owned record typically belongs to a person who is responsible for it.

That user may be able to:

- read it
- edit it
- delete it

The exact action still depends on object permissions.

## Queue-Owned Records

Queues are shared ownership buckets.

They are useful for:

- intake
- triage
- unassigned work
- team-managed work pools

Queue members can read queue-owned records, but queue membership alone does not grant edit or delete.

To take action, a queue member usually claims the record or has it reassigned.

## Groups

Groups are used for sharing, not ownership.

Each user currently belongs to one group.

Groups help the system model team-level visibility rules such as:

- all support reps can see these records
- finance team can edit records that match this criteria

## Sharing Rules

Sharing rules make records visible beyond direct ownership.

They work by:

- targeting a group
- applying criteria
- creating materialized share rows for matching user-owned records

Sharing rules do not apply to queue-owned records.

## Access Levels

Shared access can be:

- read
- edit
- delete

This is additive with normal object permissions.

## Row-Level Access Layers

After the object-level permission gate passes, record access can come from:

1. view all or modify all
2. direct user ownership
3. queue membership for read-only queue access
4. direct or group-based record shares

Any one of these can be enough.

## Claim Flow

Claiming is the bridge between shared queue work and personal ownership.

When a queue member claims a queue-owned record:

- ownership moves from queue to user
- sharing rules can begin to apply because the record is now user-owned
- the claiming user becomes the responsible owner

## Business Meaning

The point of this model is to balance:

- personal accountability through ownership
- team collaboration through queues
- controlled cross-team visibility through groups and shares

This is one of the core pieces of product logic in openCRM.

---

[Previous: History, Record Pages, and Chatter](./12-history-record-pages-and-chatter.md) | [Index](./01-index.md) | [Next: Assignment Rules and Notifications](./14-assignment-rules-and-notifications.md)
