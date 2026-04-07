# User Companion Model

**Section:** 40 Data Model

[Previous: Data Model and Prisma Map](./27-data-model-and-prisma-map.md) | [Index](./01-index.md) | [Next: Runtime and Route Map](./29-runtime-and-route-map.md)

The `User` object is a special hybrid model.

## Why It Exists

The product wants users to participate in the metadata engine for:

- layouts
- list views
- custom fields
- validation rules
- navigation

But actual account and auth data still lives in the real Prisma `User` table.

## Model

One real `User` maps to one companion `Record` for object `user`.

The real relation is:

- `Record.backingUserId`

Protected system fields:

- `name`
- `user_id`

## Source of Truth

Prisma `User` is the source of truth for:

- name
- email
- username
- password
- group membership
- user type

Companion `Record` and `FieldData` are the source of truth for:

- admin-created custom user profile fields

## Important Restrictions

- user records cannot be created through generic standard record create
- user records cannot be queue-owned
- assignment rules do not apply to `user`
- duplicate rules do not apply to `user`
- chatter and notify-on-assignment are blocked for `user`
- generic permission editing for `user` is sanitized to keep write powers off

## Implementation

- `src/lib/user-companion.ts`
- `src/actions/admin/user-actions.ts`
- `src/actions/standard/record-actions.ts`
- `src/actions/admin/permission-actions.ts`

## Why This Matters In Implementation

This is the easiest place in the repo to introduce subtle corruption if you treat `user` like a normal custom object.

---

[Previous: Data Model and Prisma Map](./27-data-model-and-prisma-map.md) | [Index](./01-index.md) | [Next: Runtime and Route Map](./29-runtime-and-route-map.md)
