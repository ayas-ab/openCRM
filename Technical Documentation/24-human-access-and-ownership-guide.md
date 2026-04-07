# Human Access and Ownership Guide

**Section:** 30 Security

[Previous: Imports, Jobs, and Files](./23-imports-jobs-and-files.md) | [Index](./01-index.md) | [Next: User Types and Access Model](./25-user-types-and-access-model.md)

This is the short human-readable explanation of how access works in the current repo.

## First Rule

Object permission is always checked before row-level access.

If the user does not have object access, ownership or sharing does not rescue the request.

## Object-Level Permissions

Configured through permission sets.

Important meanings:

- `Read` allows normal reads
- `Create` allows record creation
- `Edit` allows edits, but does not imply read
- `Delete` allows deletes, but does not imply read
- `View All` bypasses row-level filtering for reads
- `Modify All` bypasses row-level filtering for edit and delete and implies `View All`

## Row-Level Access

After object permission passes, access can come from:

1. `View All` or `Modify All`
2. direct user ownership
3. queue membership for read-only queue access
4. direct or group-based `RecordShare`

Any one of those can be enough.

## Ownership

Every record is owned either by:

- a user
- a queue

User-owned records follow the normal ownership and sharing model.

Queue-owned records are work-pool records. Queue members can read them, but queue membership alone does not grant edit or delete.

## Groups and Sharing

Groups are used for sharing, not ownership.

Sharing rules do not directly answer access checks. They create `RecordShare` rows, and those rows are what later grant access.

Current repo-truth behavior:

- sharing rules apply to user-owned records
- queue-owned records are excluded from sharing-rule materialization

## Admin Nuance

Admins can access the admin surface, but they are not implicit data superusers in the standard app.

In `/app`, admins still depend on permission sets and normal access rules unless they explicitly have `View All` or `Modify All`.

## The `User` Object Exception

The `User` object is special.

The repo treats it as a system-backed companion object:

- Prisma `User` remains the source of truth for auth/account fields
- the companion record model supports metadata-driven extensions
- generic record CRUD assumptions should not be applied to `User`

## Read Next

- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md)
- [Guardrails](./31-guardrails.md)

---

[Previous: Imports, Jobs, and Files](./23-imports-jobs-and-files.md) | [Index](./01-index.md) | [Next: User Types and Access Model](./25-user-types-and-access-model.md)
