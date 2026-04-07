"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission, hasSystemPermission } from "@/lib/permissions";
import { z } from "zod";
import { enqueueImportJob } from "@/lib/jobs/import-jobs";

export type ImportActionState = {
    success?: boolean;
    error?: string;
    jobId?: number;
};

const startImportSchema = z.object({
    objectApiName: z.string().min(1),
    mode: z.enum(["INSERT", "UPDATE", "UPSERT"]),
});

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

function normalizeHeader(header: string) {
    return header.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
    const normalized = fileName.toLowerCase().trim();
    if (normalized.endsWith(".csv")) return ".csv";
    return "";
}

function normalizeImportedRow(row: Record<string, any>) {
    const normalized: Record<string, any> = {};
    Object.entries(row).forEach(([key, value]) => {
        normalized[key] = value === undefined || value === null ? "" : value;
    });
    return normalized;
}

async function parseCsvFile(file: File): Promise<Record<string, any>[]> {
    const csvParser = await import("csv-parse/sync");
    const text = await file.text();
    const records = csvParser.parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        trim: false,
    }) as Record<string, any>[];
    return records.map(normalizeImportedRow);
}

async function parseSpreadsheet(file: File): Promise<Record<string, any>[]> {
    const ext = getFileExtension(file.name);
    if (ext === ".csv") return parseCsvFile(file);
    throw new Error("Unsupported file type");
}

export async function startImport(
    _prevState: ImportActionState,
    formData: FormData
): Promise<ImportActionState> {
    try {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthorized");
        const user = session.user as any;
        const organizationId = parseInt(user.organizationId);
        const userId = parseInt(user.id);

        const rawObjectApiName = formData.get("objectApiName");
        const rawMode = formData.get("mode");
        const file = formData.get("file");

        const parsed = startImportSchema.parse({
            objectApiName: rawObjectApiName,
            mode: rawMode,
        });

        if (!(file instanceof File)) {
            return { success: false, error: "Please upload a CSV file." };
        }

        if (file.size > MAX_IMPORT_FILE_BYTES) {
            return { success: false, error: "File exceeds max size (10MB)." };
        }

        const fileExtension = getFileExtension(file.name);
        if (!fileExtension) {
            return { success: false, error: "Unsupported file type. Please upload a CSV file." };
        }

        const canRead = await checkPermission(userId, organizationId, parsed.objectApiName, "read");
        if (!canRead) throw new Error("Unauthorized");

        const canCreate = await checkPermission(userId, organizationId, parsed.objectApiName, "create");
        const canEdit = await checkPermission(userId, organizationId, parsed.objectApiName, "edit");
        if (parsed.mode === "INSERT" && !canCreate) {
            return { success: false, error: "Create permission is required for insert imports." };
        }
        if (parsed.mode === "UPDATE" && !canEdit) {
            return { success: false, error: "Edit permission is required for update imports." };
        }
        if (parsed.mode === "UPSERT" && !(canCreate && canEdit)) {
            return { success: false, error: "Create and Edit permissions are required for upsert imports." };
        }

        const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");
        if (!canDataLoad) throw new Error("Data loading permission required");

        const objectDef = await db.objectDefinition.findUnique({
            where: {
                organizationId_apiName: {
                    organizationId,
                    apiName: parsed.objectApiName,
                },
            },
            include: {
                fields: true,
            },
        });

        if (!objectDef) throw new Error("Object not found");

        const externalIdField = objectDef.fields.find((field) => field.isExternalId);
        if (!externalIdField) {
            return {
                success: false,
                error: "External ID is required to run bulk import/update for this object.",
            };
        }
        const allowedExternal = externalIdField.type === "Text";
        if (!allowedExternal) {
            return {
                success: false,
                error: "External ID must be a Text field.",
            };
        }

        let rows: Record<string, any>[] = [];
        try {
            rows = await parseSpreadsheet(file);
        } catch {
            return { success: false, error: "Unable to read the uploaded file." };
        }
        if (rows.length === 0) {
            return { success: false, error: "No rows found in the uploaded file." };
        }
        if (rows.length > MAX_IMPORT_ROWS) {
            return { success: false, error: `Import limit is ${MAX_IMPORT_ROWS} rows per file.` };
        }

        const fields = objectDef.fields.filter((field) => field.type !== "File");
        const fieldByApi = new Map(fields.map((field) => [field.apiName.toLowerCase(), field]));

        const headers = Object.keys(rows[0] ?? {});
        const headerMap = new Map<string, { id: number; apiName: string }>();
        const usedFieldIds = new Set<number>();

        for (const header of headers) {
            const normalized = normalizeHeader(header);
            if (!normalized) continue;
            const field = fieldByApi.get(normalized);
            if (!field || field.type === "File") continue;
            if (usedFieldIds.has(field.id)) {
                return { success: false, error: `Duplicate column mapped to "${field.label}".` };
            }
            usedFieldIds.add(field.id);
            headerMap.set(header, { id: field.id, apiName: field.apiName });
        }

        if (headerMap.size === 0) {
            return { success: false, error: "No columns matched any field API names." };
        }

        const hasExternalColumn = headers.some((header) => {
            const mapped = headerMap.get(header);
            return mapped?.id === externalIdField.id;
        });

        if (!hasExternalColumn) {
            return {
                success: false,
                error: `The file must include the External ID column (${externalIdField.apiName}).`,
            };
        }

        const mappedRows = rows.map((row, index) => {
            const mapped: Record<string, any> = {};
            headerMap.forEach((fieldInfo, header) => {
                mapped[fieldInfo.apiName] = row[header];
            });
            return {
                rowIndex: index + 1,
                rawData: mapped,
            };
        });

        const job = await db.importJob.create({
            data: {
                organizationId,
                objectDefId: objectDef.id,
                createdById: userId,
                fileName: file.name,
                mode: parsed.mode,
                status: "PENDING",
                totalRows: mappedRows.length,
            },
            select: { id: true },
        });

        if (mappedRows.length > 0) {
            await db.importRow.createMany({
                data: mappedRows.map((row) => ({
                    jobId: job.id,
                    rowIndex: row.rowIndex,
                    rawData: row.rawData,
                })),
            });
        }

        await enqueueImportJob({ jobId: job.id, organizationId });

        return { success: true, jobId: job.id };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteImportJob(jobId: number, objectApiName: string) {
    try {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthorized");
        const user = session.user as any;
        const organizationId = parseInt(user.organizationId);
        const userId = parseInt(user.id);

        const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
        if (!canRead) throw new Error("Unauthorized");

        const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");
        if (!canDataLoad) throw new Error("Data loading permission required");

        const job = await db.importJob.findFirst({
            where: {
                id: jobId,
                organizationId,
                objectDef: { organizationId, apiName: objectApiName },
            },
            select: { id: true },
        });

        if (!job) {
            return { success: false, error: "Import job not found." };
        }

        await db.importJob.delete({ where: { id: jobId } });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
