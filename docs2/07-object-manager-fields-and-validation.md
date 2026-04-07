# openCRM Manual

## 07. Object Manager, Fields, and Validation

### The object manager defines the structure of the CRM

Objects describe what kinds of records exist in the system. Fields describe what information each object can store. Record pages describe how that information is presented to the user.

### Object manager

The object manager is the starting point for defining new business structures. It lists both built-in objects and custom ones, so the system feels consistent whether the data is standard CRM information or a custom business domain.

![Object manager list](images/admin-objects-list.png)

*The object manager list shows the current object catalog, including standard objects and custom objects.*

![Object detail page](images/admin-object-detail.png)

*The object detail page combines general settings with tabs for fields and relationships, validation rules, record pages, and delete impact.*

### Field types

Fields determine what kind of information can be stored on a record. The available field types cover text entry, dates, numbers, decisions, files, and relationships to other records.

#### Text fields

- Text
- TextArea
- Email
- Phone
- Url

#### Typed business fields

- Number
- Date
- DateTime
- Checkbox
- Picklist

#### Special fields

- Lookup
- File
- AutoNumber

### Field behavior matters

Some field types behave differently in the product. Lookup fields connect records, picklists define controlled choices, file fields attach documents, and auto number fields generate system IDs automatically.

### Validation rules

Validation rules live inside the object setup so that data quality can be managed close to the object definition itself. They help ensure records stay consistent when users create or edit them.

![Validation rules tab on object detail page](images/admin-object-validation-rules.png)

*The validation rules area lets administrators define checks that must pass before a record can be saved.*

---

Previous: [06-record-ownership-and-sharing.md](06-record-ownership-and-sharing.md)  
Next: [08-record-pages.md](08-record-pages.md)
