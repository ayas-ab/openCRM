# Imports, Jobs, and Files

**Section:** 20 Architecture

[Previous: Record Lifecycle](./22-record-lifecycle.md) | [Index](./01-index.md) | [Next: Human Access and Ownership Guide](./24-human-access-and-ownership-guide.md)

## Import Pipeline

Bulk import is asynchronous.

Synchronous phase:

- user uploads CSV
- server validates permissions, object, external ID, row count, and file size
- `ImportJob` and `ImportRow` rows are created
- worker job `import.process` is enqueued

Asynchronous worker phase:

- mark job `RUNNING`
- normalize rows
- resolve lookup targets by external ID
- validate row data
- enforce unique and duplicate rules
- create or update records
- persist row errors and warnings
- mark job `COMPLETED` or `FAILED`

Implementation:

- `src/actions/standard/import-actions.ts`
- `src/lib/import-processing.ts`
- `src/lib/jobs/import-jobs.ts`
- `src/jobs/sharing-rule-worker.ts`

## Worker Jobs

Current background jobs:

- `sharing-rule.recompute`
- `import.process`

The worker uses pg-boss against the same PostgreSQL database.

## File Attachments

Files are stored in `FileAttachment` metadata rows and on disk under:

- `uploads/{orgId}/{recordId}/{fieldDefId}/{attachmentId}`

Important rules:

- file access follows record access
- magic-byte validation is used
- SVG is blocked
- max upload size is 10 MB
- file fields are excluded from import

Implementation:

- `src/app/api/files/upload/route.ts`
- `src/app/api/files/[id]/route.ts`
- `src/lib/file-storage.ts`

## Security Notes

- never trust the record or field id from the client
- validate record edit rights before upload
- validate record read rights before download
- never expose physical storage details to the user

---

[Previous: Record Lifecycle](./22-record-lifecycle.md) | [Index](./01-index.md) | [Next: Human Access and Ownership Guide](./24-human-access-and-ownership-guide.md)
