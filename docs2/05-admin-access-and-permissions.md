# openCRM Manual

## 05. Admin Access and Permissions

### Permissions decide what a person can do. Ownership decides which records that permission applies to.

openCRM separates access into two layers. First, a person needs the right permission for the object. After that, the system looks at ownership, queues, and sharing to decide whether that specific record is available to them.

This model is also multi-tenant. Access is evaluated inside the current organization, so permission assignments, users, groups, queues, shares, and records do not cross tenant boundaries.

### Admin users and standard users

The standard app is for daily business work. The admin area is for configuration. A person reaches the admin area by clicking the **Setup** button in the standard app header.

#### Standard users

- Work in the standard app
- Use dashboards, list views, records, notifications, and search
- Only see apps and records they are allowed to access

#### Admin users

- Can open the admin area through Setup
- Manage data structure, access, users, queues, groups, and rules
- Still use the same standard app for daily work when needed

![Standard app dashboard with Setup button](images/standard-dashboard.png)

*The Setup button in the top-right header is the handoff point from the standard app into administration.*

![Admin dashboard](images/admin-dashboard.png)

*The admin dashboard organizes setup work around data foundation, apps, security, and user access.*

### Permissions

Permissions define what actions a person can take on an object and which apps they can open. They are managed centrally so access can be assigned consistently across the organization.

- **Object permissions**: Control the ability to read, create, edit, delete, and use broad access options for each object.
- **App permissions**: Control whether a person can open a given app and see its navigation.
- **System permissions**: Control special capabilities such as data loading and other non-object actions.

![Permission sets list](images/admin-permissions-list.png)

*The permission set list is where access models are organized at a high level.*

![Permission set detail page](images/admin-permission-detail.png)

*The detail page breaks the permission set into object permissions, app permissions, and system permissions so the access model stays explicit.*

---

Previous: [04-standard-app-imports.md](04-standard-app-imports.md)  
Next: [06-record-ownership-and-sharing.md](06-record-ownership-and-sharing.md)
