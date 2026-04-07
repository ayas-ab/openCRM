# Record Lifecycle

**Section:** 20 Architecture

[Previous: Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md) | [Index](./01-index.md) | [Next: Imports, Jobs, and Files](./23-imports-jobs-and-files.md)

## Create

The create flow is centered in `createRecord` in `src/actions/standard/record-actions.ts`.

Order:

1. authenticate user and resolve org
2. enforce object `create` permission
3. load object definition and active validations
4. validate field types, required fields, uniqueness, and lookups
5. evaluate validation rules
6. evaluate duplicate rules
7. resolve assignment rules
8. validate final owner or queue
9. transaction: create `Record` and `FieldData`
10. create notifications
11. if user-owned, materialize `RecordShare` rows from sharing rules

## Read

Reads first require object-level read access, then row access.

Record detail also resolves:

- lookup labels
- related lists
- history
- layout selection
- chatter feed

## Update

Update follows the same general path as create, but starts by checking edit or modify-all rights and then enforcing row-level edit access.

Extra update behavior:

- field history rows are written for changed fields
- owner change can create owner history
- sharing rules may be recomputed when ownership changes

## Claim

Queue-owned records can be claimed by queue members with edit permission.

Claiming:

- transfers ownership from queue to user
- writes `RecordOwnerHistory`
- clears old shares
- reapplies sharing rules for the new user owner

## Delete

Delete is hard delete, not soft delete.

Before deleting a record:

- object delete or modify-all permission is required
- row-level delete access is required unless modify-all
- inbound lookup values pointing at this record are cleared

After delete:

- cascades remove field data, shares, comments, history, attachment metadata
- upload subtree is removed from disk

## Related Notes

- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Imports, Jobs, and Files](./23-imports-jobs-and-files.md)

---

[Previous: Objects, Apps, Layouts, and Navigation](./21-objects-apps-layouts-and-navigation.md) | [Index](./01-index.md) | [Next: Imports, Jobs, and Files](./23-imports-jobs-and-files.md)
