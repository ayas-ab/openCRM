# Runtime and Route Map

**Section:** 50 Runtime

[Previous: User Companion Model](./28-user-companion-model.md) | [Index](./01-index.md) | [Next: Codebase Map](./30-codebase-map.md)

## Authentication and Proxy

- `src/auth.ts` defines NextAuth credentials auth and session fields
- `src/proxy.ts` guards public, authenticated, API, and admin paths

Session payload includes:

- `id`
- `organizationId`
- `userType`
- `username`

## Route Groups

### Public and Auth

- `/`
- `/login`
- `/register`
- `/architecture`

### Standard App

- `src/app/(standard)`
- `/app/[appApiName]/dashboard`
- `/app/[appApiName]/[objectApiName]`
- `/app/[appApiName]/[objectApiName]/[recordId]`
- `/app/[appApiName]/search`
- import pages under object routes

### Admin

- `src/app/(admin)`
- `/admin`
- `/admin/objects`
- `/admin/apps`
- `/admin/users`
- `/admin/permissions`
- `/admin/queues`
- `/admin/groups`
- `/admin/assignment-rules`
- `/admin/sharing-rules`
- `/admin/duplicate-rules`

## Server Action Split

Standard:

- record operations
- list views
- dashboards
- imports
- comments
- lookups

Admin:

- objects and fields
- apps and widgets
- users and user profile management
- permissions and permission groups
- queues and groups
- validation, assignment, sharing, duplicate, layout metadata

## API Routes

Used where route handlers make more sense than server actions:

- search
- notifications
- file upload and download
- field metadata

## Worker Runtime

Single worker process handles:

- sharing recompute jobs
- import jobs

Implementation:

- `src/jobs/sharing-rule-worker.ts`
- `src/lib/jobs/pgboss.ts`

---

[Previous: User Companion Model](./28-user-companion-model.md) | [Index](./01-index.md) | [Next: Codebase Map](./30-codebase-map.md)
