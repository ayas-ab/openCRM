# History, Record Pages, and Chatter

**Section:** 10 Product

[Previous: Search and Navigation UX](./11-search-and-navigation-ux.md) | [Index](./01-index.md) | [Next: Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md)

Record pages combine presentation, context, collaboration, and audit visibility.

## Field History

Field history captures:

- old value
- new value
- changed by
- changed at

This makes record evolution visible to end users directly on the record page.

## Record Page Layouts

Admins can define layouts that include:

- highlights
- sections
- related lists
- system blocks

The system chooses a layout by:

1. app
2. permission set
3. default fallback

## Visibility Rules

Sections and fields can be shown or hidden dynamically when their visibility conditions match.

This lets different users and record states see different page experiences.

When a visibility rule uses custom logic, the expression is validated before save using the same numbered-condition rules used by other metadata builders.

## Highlights

Highlights are a compact summary band for important fields.

TextArea and File fields are not allowed there.

## Chatter

When chatter is enabled for an object:

- a chat-style comment panel appears
- users with read access can comment
- `@mentions` trigger notifications
- comments are append-only for audit clarity

---

[Previous: Search and Navigation UX](./11-search-and-navigation-ux.md) | [Index](./01-index.md) | [Next: Ownership, Queues, Groups, and Sharing](./13-ownership-queues-groups-and-sharing.md)
