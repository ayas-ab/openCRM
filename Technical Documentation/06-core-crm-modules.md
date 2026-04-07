# Core CRM Modules

**Section:** 10 Product

[Previous: Platform Features](./05-platform-features.md) | [Index](./01-index.md) | [Next: Admin and Security Model](./07-admin-and-security-model.md)

In openCRM, standard CRM modules are implemented as pre-seeded objects in the same object system used for custom business objects.

## Contact

Represents a person.

Typical fields:

- name
- full name
- first name
- last name
- email
- phone
- title
- company lookup

## Company

Represents a business or account.

Typical fields:

- company name
- website
- industry
- size as a common CRM concept

Companies often act as a central anchor for contacts, opportunities, and cases.

## Opportunity

Represents a sales deal or pipeline item.

Typical fields:

- opportunity name
- amount
- stage
- close date
- company lookup
- contact linkage as part of the intended product model

## Case

Represents a support or service issue.

Typical fields:

- case number
- subject
- description
- status
- priority
- company lookup
- support-style queue and ownership workflows

## User

Represents an application user inside the CRM model.

This module is special because it allows the product to:

- place users in navigation
- assign layouts and list views to user records
- add custom profile fields
- let users open their own profile from the standard app

The `User` object behaves differently from normal objects internally. See:

- [User Companion Model](./28-user-companion-model.md)

## Why These Matter

These seeded modules give a new organization a working CRM foundation on day one, while still allowing the system to grow into vertical-specific use cases through custom objects.

## Product Interpretation Note

The narrative product description sometimes expresses the intended CRM shape more broadly than the currently seeded field set.

The documentation should preserve both:

- current implemented behavior
- intended product meaning of the standard module

---

[Previous: Platform Features](./05-platform-features.md) | [Index](./01-index.md) | [Next: Admin and Security Model](./07-admin-and-security-model.md)
