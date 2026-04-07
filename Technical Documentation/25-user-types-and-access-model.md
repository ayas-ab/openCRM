# User Types and Access Model

**Section:** 30 Security

[Previous: Human Access and Ownership Guide](./24-human-access-and-ownership-guide.md) | [Index](./01-index.md) | [Next: Permissions and Record Access](./26-permissions-and-record-access.md)

There are two runtime user types:

- `admin`
- `standard`

## Shared Characteristics

Both:

- authenticate through the same NextAuth credential flow
- belong to exactly one organization
- can use the standard app under `/app`
- are still constrained by object permissions and row access in standard data flows

## Standard User

Standard users are business operators.

They can:

- access assigned apps
- read and modify records only when object and row-level rules permit it
- use list views, dashboards, imports, search, notifications, and comments within granted scope
- edit their own user companion record through the standard app

They cannot:

- access `/admin`
- manage metadata
- manage users, permission sets, queues, groups, or rules

## Admin User

Admins are configuration operators.

They can:

- access `/admin`
- manage objects, fields, apps, layouts, users, permissions, queues, groups, and rules
- use the same standard app as normal users

Important nuance:

Admins are not implicit data superusers in standard app logic.

If an admin lacks object `read` or `viewAll`, standard record actions still enforce those restrictions.

## Hard Admin Boundary

`src/proxy.ts` and `src/app/(admin)/layout.tsx` block `/admin` for non-admin users.

## Related Notes

- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Runtime and Route Map](./29-runtime-and-route-map.md)

---

[Previous: Human Access and Ownership Guide](./24-human-access-and-ownership-guide.md) | [Index](./01-index.md) | [Next: Permissions and Record Access](./26-permissions-and-record-access.md)
