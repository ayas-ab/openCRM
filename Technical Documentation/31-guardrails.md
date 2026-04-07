# Guardrails

**Section:** Implementation Guidance

[Previous: Codebase Map](./30-codebase-map.md) | [Index](./01-index.md) | [Next: Invariants](./32-invariants.md)

Treat this note as core implementation guidance for non-trivial work.

It consolidates the durable project guardrails directly into this documentation set so the guidance stays self-contained.

## Always Apply These

- trust code and schema over old prose
- if a change affects durable behavior or architecture, update the technical documentation

## Tenant Isolation

- Every tenant-scoped query must enforce `organizationId`.
- Every foreign ID from the client must be validated against the same organization before use.
- Never trust object IDs, field IDs, queue IDs, group IDs, permission set IDs, record IDs, or layout IDs just because the UI sent them.

## Access Order

Access evaluation always starts with object-level permission.

Do not let row-level logic bypass object permission.

Object-level gate:

- `Read` requires `Read`, `View All`, or `Modify All`
- `Edit` requires `Edit` or `Modify All`
- `Delete` requires `Delete` or `Modify All`
- `Create` requires `Create`
- `View All` bypasses row filtering for reads
- `Modify All` bypasses row filtering for edit and delete and implies `View All`

If the object permission gate fails, access stops.

## Row-Level Access Model

After the object permission gate passes, row-level access is additive.

The effective order is:

1. `View All` or `Modify All`
2. direct user ownership
3. queue membership for read-only queue access
4. direct or group-based `RecordShare` on user-owned records

Important rules:

- queue membership grants read only
- queue membership never grants edit or delete
- queue-owned records must be claimed or reassigned before normal user-owner behavior applies
- `RecordShare` does not apply to queue-owned records
- owner-group sharing criteria only apply to user-owned records

## Server Boundaries

- Keep secrets and sensitive logic on the server.
- Prefer Server Components for reads.
- Prefer Server Actions for app-internal writes.
- Use Route Handlers for uploads, downloads, webhooks, external endpoints, and browser-driven fetch endpoints.
- Do not call internal APIs from Server Components without a strong reason.

## Metadata Sensitivity

Treat metadata as sensitive, including:

- object definitions
- field definitions
- validation rules
- sharing rules
- assignment rules
- list views
- layouts
- app navigation metadata

If a user should not know a field exists, do not expose that metadata casually.

## Transactions And Side Effects

Default to transactions when one business event touches multiple tables.

Examples:

- record plus field data writes
- ownership changes plus history
- account row plus related record sync
- import status changes
- metadata creation plus dependency refresh

If ownership, queues, shares, groups, or sharing rules change visibility, deliberately recompute or refresh dependent state.

## User Object Is Special

- `User` is a system-backed companion object, not normal generic record CRUD.
- One Prisma `User` maps to one companion `Record`.
- `Record.backingUserId` is the real relational link.
- Prisma `User` remains the source of truth for account and auth fields.
- Companion `FieldData` is the source of truth only for admin-created custom user fields.
- `name` and `user_id` are protected system fields.
- Do not allow generic create, delete, import, assignment, or queue ownership flows for `User`.
- Validation rules still apply to user edits.
- Admin edits should update Prisma `User` and companion record data in one transaction.
- Standard-area self-edit must stay limited to the current user's own record and allowed fields.

## Duplicate Rules

- Duplicate rules are tenant-scoped metadata.
- They are multi-field matching logic, not a replacement for one-field `Unique` or `External ID`.
- Enforce duplicate rules server-side on save and import.
- Client warnings are not enforcement.
- `BLOCK` results must never be bypassed by the client.
- On import, `WARN` stays non-blocking but must be surfaced in results.
- Duplicate checks may inspect hidden records; do not leak protected record details in messages.
- Duplicate rules for `User` should stay blocked unless user-specific save flows explicitly support them.
- Duplicate rule references must participate in metadata dependency tracking.

## Metadata Dependency Index

If a feature stores references to objects, fields, layouts, or other metadata artifacts, it must participate in the metadata dependency index and safe-delete flow.

That means keeping `src/lib/metadata-dependencies.ts` and dependency refresh behavior up to date.

## File And Import Safety

For files:

- validate by content, not only extension
- block SVG by default
- enforce file size limits
- enforce tenant-aware access
- do not expose physical storage details casually

For imports:

- enforce permission checks
- validate foreign IDs against the current org
- enforce row and file limits before deep parsing
- require correct external ID behavior
- validate before writing
- enforce duplicate rules during row processing
- use background jobs for larger workflows
- explicitly block import on unsupported objects

## Lookup Integrity

- Lookup targets must be valid for the current org.
- Lookup values must exist in the target object and same org.
- Do not casually allow lookup target object changes after field creation.

## Raw SQL, Logging, And Dependencies

- Prefer Prisma query builder unless raw SQL is genuinely needed.
- Parameterize all raw SQL and keep tenant filters intact.
- Do not log passwords, tokens, raw session payloads, or uploaded contents.
- Minimize production logging of PII and free text.
- Preserve audit behavior where the product expects it.
- Do not add dependencies casually; check existing dependencies first.

## Rendering And Least Privilege

- Avoid unstable client rendering from `Date.now()`, `Math.random()`, or mismatched server/client branches.
- Admin routes and actions still need server-side admin checks.
- Standard routes and actions still need object permission and row access checks.
- Do not introduce hidden superuser shortcuts without documenting them clearly.

## Related Notes

- [Invariants](./32-invariants.md)
- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md)
- [User Companion Model](./28-user-companion-model.md)

---

[Previous: Codebase Map](./30-codebase-map.md) | [Index](./01-index.md) | [Next: Invariants](./32-invariants.md)
