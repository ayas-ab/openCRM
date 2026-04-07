# Permissions and Record Access

**Section:** 30 Security

[Previous: User Types and Access Model](./25-user-types-and-access-model.md) | [Index](./01-index.md) | [Next: Data Model and Prisma Map](./27-data-model-and-prisma-map.md)

This is one of the most important notes in this documentation set.

## Enforcement Order

Always:

1. object-level permission
2. row-level access

Row logic must never bypass object permission.

## Object-Level Permissions

Configured in `ObjectPermission` through permission sets.

Main flags:

- `allowRead`
- `allowCreate`
- `allowEdit`
- `allowDelete`
- `allowViewAll`
- `allowModifyAll`
- `allowModifyListViews`

Rules:

- `View All` gives global read for that object
- `Modify All` gives global edit/delete and implies `View All`
- edit does not imply read
- delete does not imply read

## Row-Level Access

After object permission passes, access can be granted by:

1. `View All` or `Modify All`
2. direct user ownership
3. queue membership for read-only access to queue-owned records
4. `RecordShare` rows for the user or their group

## Queue Behavior

Queues are ownership buckets.

Queue members:

- can read queue-owned records
- cannot edit or delete by queue membership alone
- must claim or be reassigned to gain user ownership behavior

## Sharing Rules

Sharing rules are metadata. They do not directly answer reads.

Instead, they materialize `RecordShare` rows for user-owned records.

Queue-owned records are excluded from sharing rule materialization.

## User Object Exception

The `User` object is special:

- read and view-all are allowed
- create, edit, delete, modify-all are forced off at the permission level
- writes go through dedicated user-aware actions, not generic standard CRUD

Implementation:

- `src/lib/permissions.ts`
- `src/lib/record-access.ts`
- `src/actions/admin/permission-actions.ts`
- `src/actions/standard/record-actions.ts`

---

[Previous: User Types and Access Model](./25-user-types-and-access-model.md) | [Index](./01-index.md) | [Next: Data Model and Prisma Map](./27-data-model-and-prisma-map.md)
