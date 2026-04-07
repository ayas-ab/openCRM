# Admin and Security Model

**Section:** 10 Product

[Previous: Core CRM Modules](./06-core-crm-modules.md) | [Index](./01-index.md) | [Next: Objects and Fields](./08-objects-and-fields.md)

This note describes the product-facing security and administration model.

## Permission Sets

openCRM uses permission sets as the primary security unit.

These define:

- object access
- app access
- system permissions

Permission rights are additive across assigned sets.

## Permission Set Groups

Permission set groups bundle multiple permission sets together for easier administration.

## User Types

There are two user types:

- admin
- standard

Important product rule:

- admins do not automatically get all data rights in the standard app
- admins do get access to the `/admin` area

## Row-Level Security

After object permissions pass, record visibility still depends on:

- ownership
- queue membership
- group-based shares
- view all and modify all overrides

## Data Security

The product is designed around:

- per-organization data isolation
- protected file downloads
- protected APIs
- ownership-aware visibility
- cleanup of lookups when records are deleted

## Registration and Onboarding

Sign-up automatically:

1. creates an organization
2. creates the first admin user
3. seeds core objects and fields

After that, admins can invite users and configure the system.

## Object Settings

Objects can carry user-facing behavior flags such as:

- notify on assignment
- enable chatter
- duplicate management behavior

---

[Previous: Core CRM Modules](./06-core-crm-modules.md) | [Index](./01-index.md) | [Next: Objects and Fields](./08-objects-and-fields.md)
