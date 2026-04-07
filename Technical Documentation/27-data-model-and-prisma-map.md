# Data Model and Prisma Map

**Section:** 40 Data Model

[Previous: Permissions and Record Access](./26-permissions-and-record-access.md) | [Index](./01-index.md) | [Next: User Companion Model](./28-user-companion-model.md)

This note maps the core schema entities by responsibility.

## Tenancy

- `Organization`
- almost every important model has `organizationId`

## Identity and Auth

- `User`
- `Organization.ownerId`
- `UserType`

## Permissions

- `PermissionSet`
- `PermissionSetAssignment`
- `PermissionSetGroup`
- `PermissionSetGroupAssignment`
- `PermissionSetAssignmentSource`
- `ObjectPermission`
- `AppPermission`

## Team and Sharing

- `Queue`
- `QueueMember`
- `Group`
- `RecordShare`
- `AssignmentRule`
- `SharingRule`

## Metadata

- `ObjectDefinition`
- `FieldDefinition`
- `PicklistOption`
- `ValidationRule`
- `ValidationCondition`
- `DuplicateRule`
- `DuplicateRuleCondition`
- `RecordPageLayout`
- `RecordPageAssignment`
- `AppDefinition`
- `AppNavItem`
- `ListView`
- `ListViewColumn`
- `ListViewShare`
- `UserListViewPreference`
- `ListViewPin`
- `MetadataDependency`

## Universal Data Engine

- `Record`
- `FieldData`
- `FileAttachment`
- `FieldHistory`
- `RecordOwnerHistory`
- `RecordComment`
- `RecordCommentMention`
- `Notification`

## Async Import

- `ImportJob`
- `ImportRow`

## Key Relationships

- one `ObjectDefinition` has many `FieldDefinition`
- one `Record` belongs to one `ObjectDefinition`
- one `Record` has many `FieldData`
- one `FieldData` stores one typed value for one field on one record
- one `Record` may be user-owned or queue-owned
- one `Record` may have many materialized shares

## Query Model

The app frequently combines:

- metadata query
- permission query
- row access predicate
- EAV joins or typed field queries

That is why schema understanding alone is not enough. Read this note with:

- [Permissions and Record Access](./26-permissions-and-record-access.md)
- [Runtime and Route Map](./29-runtime-and-route-map.md)
- [Codebase Map](./30-codebase-map.md)

---

[Previous: Permissions and Record Access](./26-permissions-and-record-access.md) | [Index](./01-index.md) | [Next: User Companion Model](./28-user-companion-model.md)
