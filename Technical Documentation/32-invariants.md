# Invariants

**Section:** Implementation Guidance

[Previous: Guardrails](./31-guardrails.md) | [Index](./01-index.md) | [Next: Key File Map](./33-key-file-map.md)

These are the constraints developers should treat as hard rules unless the product direction explicitly changes them.

For the fuller implementation guidance, pair this note with [Guardrails](./31-guardrails.md).

## Access And Tenant Safety

- Every tenant-scoped query must enforce `organizationId`.
- Object permission checks happen before row-level access checks.
- Admin users can access admin configuration, but they are not implicit data superusers in standard app flows.
- Queue membership does not automatically grant edit rights to queue-owned records.

## Data Model And Metadata

- The app uses a metadata-driven universal `Record` plus typed `FieldData` EAV model.
- The `User` object is special and cannot be treated like generic record CRUD.
- Metadata references must participate in dependency tracking for safe deletion.

## Operational Constraints

- If code changes behavior or architecture, update the technical documentation.

---

[Previous: Invariants](./31-guardrails.md) | [Index](./01-index.md)