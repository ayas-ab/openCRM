import { db } from "@/lib/db";
import { buildFieldDataPayload, deriveRecordName } from "@/lib/field-data";
import { nextAutoNumberValue } from "@/lib/auto-number";
import { validateRecordData } from "@/lib/validation/record-validation";
import { normalizeStoredUniqueValue, normalizeUniqueValue } from "@/lib/unique";
import { findDuplicateMatches } from "@/lib/duplicates/duplicate-rules";
import { Prisma } from "@prisma/client";
import { formatDateOnlyForInput, parseDateOnlyValue, parseDateTimeValue } from "@/lib/temporal";

const SEARCHABLE_EXTERNAL_TYPES = new Set(["Text"]);

type LookupTargetMap = {
    externalFieldId: number;
    valueMap: Map<string, number>;
};

type DuplicateFieldRow = {
    fieldDefId: number;
    valueText: string | null;
    valueDate: Date | null;
    valueBoolean: boolean | null;
    valueLookup: number | null;
    valuePicklistId: number | null;
};

function normalizeValue(value: any) {
    if (value === undefined || value === null) return null;
    const stringValue = String(value).trim();
    return stringValue === "" ? null : stringValue;
}

function normalizeKey(value: string) {
    return value.trim().toLowerCase();
}

function excelDateToISO(serial: number) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(serial * 86400000);
    const date = new Date(excelEpoch.getTime() + ms);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function parseRowErrors(error: any) {
    try {
        const parsed = JSON.parse(error.message);
        if (parsed && typeof parsed === "object") {
            return Object.values(parsed).map(String);
        }
    } catch {
        // ignore
    }
    return [String(error.message ?? "Validation failed")];
}

function getStoredDuplicateRuleValue(
    fieldType: string,
    row: DuplicateFieldRow
): string | number | boolean | null {
    switch (fieldType) {
        case "Date":
            return row.valueDate ? formatDateOnlyForInput(row.valueDate) : null;
        case "DateTime":
            return row.valueDate ? row.valueDate.toISOString() : null;
        case "Checkbox":
            return row.valueBoolean ?? null;
        case "Lookup":
            return row.valueLookup ?? null;
        case "Picklist":
            return row.valuePicklistId ?? null;
        default:
            return row.valueText ?? null;
    }
}

function mergeImportDuplicateValueMap(
    existingValues: Record<string, string | number | boolean | null> | undefined,
    incomingValues: Record<string, any>
) {
    return {
        ...(existingValues ?? {}),
        ...incomingValues,
    };
}

export async function processImportJob(jobId: number) {
    const job = await db.importJob.findUnique({
        where: { id: jobId },
        include: {
            rows: { orderBy: { rowIndex: "asc" } },
            objectDef: {
                include: {
                    fields: {
                        include: { picklistOptions: true },
                    },
                },
            },
        },
    });

    if (!job) {
        return;
    }

    await db.importJob.update({
        where: { id: job.id },
        data: { status: "RUNNING", errorMessage: null },
    });

    try {
        const fields = job.objectDef.fields;
        const externalIdField = fields.find((field) => field.isExternalId);

        if (!externalIdField) {
            await db.importJob.update({
                where: { id: job.id },
                data: {
                    status: "FAILED",
                    errorMessage: "External ID field is required for import.",
                },
            });
            return;
        }

        if (!SEARCHABLE_EXTERNAL_TYPES.has(externalIdField.type)) {
            await db.importJob.update({
                where: { id: job.id },
                data: {
                    status: "FAILED",
                    errorMessage: "External ID must be a Text field.",
                },
            });
            return;
        }

        const picklistMaps = new Map<number, Map<string, number>>();
        for (const field of fields) {
            if (field.type !== "Picklist") continue;
            const map = new Map<string, number>();
            for (const option of field.picklistOptions || []) {
                map.set(option.label.toLowerCase(), option.id);
                map.set(option.apiName.toLowerCase(), option.id);
            }
            picklistMaps.set(field.id, map);
        }

        const lookupFields = fields.filter((field) => field.type === "Lookup" && field.lookupTargetId);
        const lookupTargetIds = Array.from(new Set(lookupFields.map((field) => field.lookupTargetId!)));

        const targetExternalFields = await db.fieldDefinition.findMany({
            where: {
                objectDefId: { in: lookupTargetIds },
                isExternalId: true,
            },
            select: { id: true, objectDefId: true },
        });

        const targetExternalByObject = new Map(
            targetExternalFields.map((field) => [field.objectDefId, field])
        );

        const lookupMaps = new Map<number, LookupTargetMap>();

        for (const field of lookupFields) {
            const targetExternal = targetExternalByObject.get(field.lookupTargetId!);
            if (!targetExternal) {
                lookupMaps.set(field.id, { externalFieldId: 0, valueMap: new Map() });
                continue;
            }

            const lookupValues = new Set<string>();
            for (const row of job.rows) {
                const raw = (row.rawData as any)[field.apiName];
                const normalized = normalizeValue(raw);
                if (normalized) lookupValues.add(normalizeKey(normalized));
            }

            if (lookupValues.size === 0) {
                lookupMaps.set(field.id, { externalFieldId: targetExternal.id, valueMap: new Map() });
                continue;
            }

            const lookupFieldData = await db.fieldData.findMany({
                where: {
                    fieldDefId: targetExternal.id,
                    OR: [
                        { valueSearch: { in: Array.from(lookupValues) } },
                        { valueText: { in: Array.from(lookupValues) } },
                    ],
                },
                select: { recordId: true, valueSearch: true, valueText: true },
            });

            const valueMap = new Map<string, number>();
            for (const row of lookupFieldData) {
                const key = row.valueSearch ?? row.valueText?.toLowerCase();
                if (!key) continue;
                valueMap.set(key, row.recordId);
            }

            lookupMaps.set(field.id, { externalFieldId: targetExternal.id, valueMap });
        }

        const externalValues = new Map<string, number[]>();
        for (const row of job.rows) {
            const raw = (row.rawData as any)[externalIdField.apiName];
            const normalized = normalizeValue(raw);
            if (!normalized) continue;
            const key = normalizeKey(normalized);
            const list = externalValues.get(key) ?? [];
            list.push(row.id);
            externalValues.set(key, list);
        }

        const duplicateExternalIds = new Set<string>();
        externalValues.forEach((rowIds, key) => {
            if (rowIds.length > 1) duplicateExternalIds.add(key);
        });

        const externalKeys = Array.from(externalValues.keys());
        const existingFieldData = externalKeys.length
            ? await db.fieldData.findMany({
                where: {
                    fieldDefId: externalIdField.id,
                    OR: [
                        { valueSearch: { in: externalKeys } },
                        { valueText: { in: externalKeys } },
                    ],
                },
                select: { recordId: true, valueSearch: true, valueText: true },
            })
            : [];

        const existingMap = new Map<string, number>();
        for (const row of existingFieldData) {
            const key = row.valueSearch ?? row.valueText?.toLowerCase();
            if (!key) continue;
            existingMap.set(key, row.recordId);
        }

        const existingRecordIds = Array.from(new Set(existingMap.values()));
        const duplicateRuleFieldIds = await db.duplicateRuleCondition.findMany({
            where: {
                rule: {
                    organizationId: job.organizationId,
                    objectDefId: job.objectDefId,
                    isActive: true,
                },
            },
            select: { fieldDefId: true },
        });
        const duplicateFieldIds = Array.from(new Set(duplicateRuleFieldIds.map((row) => row.fieldDefId)));
        const fieldsById = new Map(fields.map((field) => [field.id, field]));
        const existingDuplicateValuesByRecordId = new Map<number, Record<string, string | number | boolean | null>>();

        if (existingRecordIds.length > 0 && duplicateFieldIds.length > 0) {
            const existingDuplicateFieldRows = await db.fieldData.findMany({
                where: {
                    recordId: { in: existingRecordIds },
                    fieldDefId: { in: duplicateFieldIds },
                },
                select: {
                    recordId: true,
                    fieldDefId: true,
                    valueText: true,
                    valueDate: true,
                    valueBoolean: true,
                    valueLookup: true,
                    valuePicklistId: true,
                },
            });

            for (const row of existingDuplicateFieldRows) {
                const field = fieldsById.get(row.fieldDefId);
                if (!field) continue;

                const recordValueMap = existingDuplicateValuesByRecordId.get(row.recordId) ?? {};
                recordValueMap[field.apiName] = getStoredDuplicateRuleValue(field.type, row);
                existingDuplicateValuesByRecordId.set(row.recordId, recordValueMap);
            }
        }

        const uniqueFields = fields.filter(
            (field) => field.isUnique && !field.isExternalId && ["Text", "Email", "Phone"].includes(field.type)
        );
        const uniqueDuplicateKeysByField = new Map<number, Set<string>>();
        const uniqueFileKeysByField = new Map<number, string[]>();
        const uniquePhoneRawValuesByField = new Map<number, string[]>();

        for (const field of uniqueFields) {
            const valueMap = new Map<string, number[]>();
            const rawValues: string[] = [];
            for (const row of job.rows) {
                const raw = (row.rawData as any)[field.apiName];
                const normalized = normalizeUniqueValue(field.type, raw);
                if (!normalized) continue;
                const list = valueMap.get(normalized) ?? [];
                list.push(row.id);
                valueMap.set(normalized, list);
                rawValues.push(String(raw).trim());
            }

            const duplicates = new Set<string>();
            valueMap.forEach((rowIds, key) => {
                if (rowIds.length > 1) duplicates.add(key);
            });

            uniqueDuplicateKeysByField.set(field.id, duplicates);
            uniqueFileKeysByField.set(field.id, Array.from(valueMap.keys()));
            if (field.type === "Phone") {
                uniquePhoneRawValuesByField.set(field.id, rawValues);
            }
        }

        const uniqueExistingByField = new Map<number, Map<string, number>>();
        for (const field of uniqueFields) {
            const keys = uniqueFileKeysByField.get(field.id) ?? [];
            if (keys.length === 0) continue;
            const rawPhoneValues = uniquePhoneRawValuesByField.get(field.id) ?? [];

            const existing = await db.fieldData.findMany({
                where: {
                    fieldDefId: field.id,
                    OR: field.type === "Phone"
                        ? [
                            { valueSearch: { in: keys } },
                            { valueText: { in: rawPhoneValues } },
                        ]
                        : [{ valueSearch: { in: keys } }],
                },
                select: { recordId: true, valueText: true, valueSearch: true },
            });

            const map = new Map<string, number>();
            for (const row of existing) {
                const key = normalizeStoredUniqueValue(field.type, row.valueText, row.valueSearch);
                if (!key) continue;
                map.set(key, row.recordId);
            }
            uniqueExistingByField.set(field.id, map);
        }

        let successCount = 0;
        let errorCount = 0;

        const importUser = await db.user.findUnique({
            where: { id: job.createdById },
            select: {
                id: true,
                groupId: true,
                queueMemberships: {
                    select: { queueId: true },
                },
            },
        });

        const queueIds = importUser?.queueMemberships.map((membership) => membership.queueId) ?? [];
        const userGroupId = importUser?.groupId ?? null;

        for (const row of job.rows) {
            const rowErrors: string[] = [];
            const rowWarnings: string[] = [];
            const rawData = row.rawData as Record<string, any>;

            const externalValue = normalizeValue(rawData[externalIdField.apiName]);
            if (!externalValue) {
                rowErrors.push(`External ID (${externalIdField.label}) is required.`);
            }
            const externalKey = externalValue ? normalizeKey(externalValue) : null;
            if (externalKey && duplicateExternalIds.has(externalKey)) {
                rowErrors.push("External ID is duplicated within this import file.");
            }

            const existingRecordId = externalKey ? existingMap.get(externalKey) : undefined;
            const mode = job.mode;

            let action: "create" | "update" | "skip" = "create";
            if (mode === "INSERT") {
                if (existingRecordId) {
                    rowErrors.push("External ID already exists (insert mode).");
                    action = "skip";
                }
            } else if (mode === "UPDATE") {
                if (!existingRecordId) {
                    rowErrors.push("External ID not found (update mode).");
                    action = "skip";
                } else {
                    action = "update";
                }
            } else {
                action = existingRecordId ? "update" : "create";
            }

            const normalizedData: Record<string, any> = {};
            const presentFields = new Set<string>();

            for (const field of fields) {
                if (!(field.apiName in rawData)) continue;
                if (field.type === "File" || field.type === "AutoNumber") continue;

                presentFields.add(field.apiName);
                const rawValue = rawData[field.apiName];
                let normalized = normalizeValue(rawValue);

                if (field.type === "Date") {
                    if (rawValue instanceof Date) {
                        normalized = formatDateOnlyForInput(rawValue);
                    } else if (rawValue && typeof rawValue === "object" && "value" in rawValue) {
                        const value = (rawValue as any).value;
                        normalized = typeof value === "string" ? value : normalizeValue(value);
                    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
                        normalized = excelDateToISO(rawValue);
                    }
                } else if (field.type === "DateTime") {
                    if (rawValue instanceof Date) {
                        normalized = rawValue.toISOString();
                    } else if (rawValue && typeof rawValue === "object" && "value" in rawValue) {
                        const value = (rawValue as any).value;
                        normalized = typeof value === "string" ? value : normalizeValue(value);
                    }
                }

                if (field.type === "Picklist") {
                    if (!normalized) {
                        normalizedData[field.apiName] = null;
                        continue;
                    }
                    if (normalized.includes(";")) {
                        rowErrors.push(`${field.label} does not support multiple values.`);
                        continue;
                    }
                    const map = picklistMaps.get(field.id);
                    const optionId = map?.get(normalizeKey(normalized));
                    if (!optionId) {
                        rowErrors.push(`${field.label} must be a valid picklist option.`);
                        continue;
                    }
                    normalizedData[field.apiName] = optionId;
                    continue;
                }

                if (field.type === "Lookup") {
                    if (!normalized) {
                        normalizedData[field.apiName] = null;
                        continue;
                    }
                    const lookupMap = lookupMaps.get(field.id);
                    if (!lookupMap || lookupMap.externalFieldId === 0) {
                        rowErrors.push(`${field.label} lookup target has no External ID field.`);
                        continue;
                    }
                    const recordId = lookupMap.valueMap.get(normalizeKey(normalized));
                    if (!recordId) {
                        rowErrors.push(`${field.label} lookup target not found.`);
                        continue;
                    }
                    normalizedData[field.apiName] = recordId;
                    continue;
                }

                normalizedData[field.apiName] = normalized ?? null;
            }

            if (rowErrors.length === 0) {
                for (const field of fields) {
                    if (!(field.apiName in rawData)) continue;
                    if (!["Date", "DateTime"].includes(field.type)) continue;
                    const value = normalizedData[field.apiName];
                    if (value === null) continue;
                    if (
                        typeof value !== "string" ||
                        (field.type === "Date" ? !parseDateOnlyValue(value) : !parseDateTimeValue(value))
                    ) {
                        rowErrors.push(
                            field.type === "Date"
                                ? `${field.label} must be in YYYY-MM-DD or ISO format.`
                                : `${field.label} must be a valid ISO date-time value.`
                        );
                    }
                }
            }

            if (rowErrors.length === 0) {
                try {
                    validateRecordData(fields, normalizedData, {
                        ignoreMissingRequired: action === "update",
                    });
                } catch (error: any) {
                    rowErrors.push(...parseRowErrors(error));
                }
            }

            if (rowErrors.length === 0) {
                for (const field of uniqueFields) {
                    if (!(field.apiName in rawData)) continue;
                    const normalized = normalizeUniqueValue(field.type, rawData[field.apiName]);
                    if (!normalized) continue;

                    const duplicates = uniqueDuplicateKeysByField.get(field.id);
                    if (duplicates?.has(normalized)) {
                        rowErrors.push(`${field.label} is duplicated within this import file.`);
                        continue;
                    }

                    const uniqueRecordId = uniqueExistingByField.get(field.id)?.get(normalized);
                    if (uniqueRecordId) {
                        if (action === "create") {
                            rowErrors.push(`${field.label} must be unique. The value already exists.`);
                        } else if (uniqueRecordId !== existingRecordId) {
                            rowErrors.push(`${field.label} must be unique. The value already exists.`);
                        }
                    }
                }
            }

            if (rowErrors.length === 0 && action !== "skip") {
                const duplicateValueMap =
                    action === "update" && existingRecordId
                        ? mergeImportDuplicateValueMap(
                            existingDuplicateValuesByRecordId.get(existingRecordId),
                            normalizedData
                        )
                        : normalizedData;

                const duplicateMatches = await findDuplicateMatches({
                    organizationId: job.organizationId,
                    objectDefId: job.objectDefId,
                    valueMap: duplicateValueMap,
                    mode: action === "update" ? "edit" : "create",
                    recordId: action === "update" ? existingRecordId : undefined,
                    canReadObject: true,
                    canReadAll: false,
                    userId: job.createdById,
                    queueIds,
                    userGroupId,
                    includeReadableMatches: false,
                });

                if (duplicateMatches.blockingRuleIds.length > 0) {
                    rowErrors.push("This row matches an active duplicate blocking rule and cannot be imported.");
                } else if (duplicateMatches.warningRuleIds.length > 0) {
                    rowWarnings.push("This row imported, but it matches an active duplicate warning rule.");
                }
            }

            if (rowErrors.length > 0 || action === "skip") {
                await db.importRow.update({
                    where: { id: row.id },
                    data: {
                        errors: { messages: rowErrors },
                        warnings: Prisma.JsonNull,
                    },
                });
                errorCount += 1;
                continue;
            }

            try {
                const recordId = await db.$transaction(async (tx) => {
                    let recordIdInner = existingRecordId;
                    const autoNumberValues = new Map<number, string>();
                    if (action === "create") {
                        for (const field of fields) {
                            if (field.type !== "AutoNumber") continue;
                            const value = await nextAutoNumberValue(tx, field.id);
                            autoNumberValues.set(field.id, value);
                        }
                        const nameField = fields.find((field) => field.apiName === "name");
                        let recordName = deriveRecordName(fields, normalizedData);
                        if (nameField?.type === "AutoNumber") {
                            const generatedName = autoNumberValues.get(nameField.id);
                            if (generatedName) {
                                recordName = generatedName;
                            }
                        }
                        const created = await tx.record.create({
                            data: {
                                organizationId: job.organizationId,
                                objectDefId: job.objectDefId,
                                name: recordName,
                                ownerId: job.createdById,
                                ownerType: "USER",
                                createdById: job.createdById,
                                lastModifiedById: job.createdById,
                            },
                            select: { id: true },
                        });
                        recordIdInner = created.id;
                    } else if (recordIdInner) {
                        const recordName = normalizedData["name"]
                            ? deriveRecordName(fields, normalizedData)
                            : null;
                        await tx.record.update({
                            where: { id: recordIdInner },
                            data: {
                                ...(recordName ? { name: recordName } : {}),
                                lastModifiedById: job.createdById,
                            },
                        });
                    }

                    if (!recordIdInner) {
                        throw new Error("Record could not be created or found.");
                    }

                    const payloads = fields
                        .filter((field) => field.type !== "File")
                        .filter((field) => field.type === "AutoNumber" || presentFields.has(field.apiName))
                        .map((field) => {
                            if (field.type === "AutoNumber") {
                                const value = autoNumberValues.get(field.id);
                                if (!value) return null;
                                return {
                                    fieldDefId: field.id,
                                    ...buildFieldDataPayload(field, value),
                                };
                            }
                            return {
                                fieldDefId: field.id,
                                ...buildFieldDataPayload(field, normalizedData[field.apiName]),
                            };
                        })
                        .filter(Boolean) as Array<{ fieldDefId: number } & ReturnType<typeof buildFieldDataPayload>>;

                    for (const payload of payloads) {
                        await tx.fieldData.upsert({
                            where: {
                                recordId_fieldDefId: {
                                    recordId: recordIdInner,
                                    fieldDefId: payload.fieldDefId,
                                },
                            },
                            create: {
                                recordId: recordIdInner,
                                ...payload,
                            },
                            update: payload,
                        });
                    }

                    return recordIdInner;
                });

                await db.importRow.update({
                    where: { id: row.id },
                    data: {
                        recordId,
                        errors: Prisma.JsonNull,
                        warnings: rowWarnings.length > 0 ? { messages: rowWarnings } : Prisma.JsonNull,
                    },
                });
                successCount += 1;
            } catch (error: any) {
                const message = error instanceof Prisma.PrismaClientKnownRequestError
                    ? error.message
                    : String(error.message ?? "Failed to import row");
                await db.importRow.update({
                    where: { id: row.id },
                    data: {
                        errors: { messages: [message] },
                        warnings: Prisma.JsonNull,
                    },
                });
                errorCount += 1;
            }
        }

        await db.importJob.update({
            where: { id: job.id },
            data: {
                status: "COMPLETED",
                successCount,
                errorCount,
                completedAt: new Date(),
            },
        });
    } catch (error: any) {
        await db.importJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                errorMessage: String(error.message ?? "Import failed"),
                completedAt: new Date(),
            },
        });
    }
}
