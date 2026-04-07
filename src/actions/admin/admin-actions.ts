"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deleteFileSafe, deleteFolderSafe, resolveStoragePath } from "@/lib/file-storage";
import { normalizeApiName, normalizePicklistApiName } from "@/lib/api-names";
import { isReservedObjectApiName, USER_ID_FIELD_API_NAME, USER_OBJECT_API_NAME } from "@/lib/user-companion";
import {
    getFieldDependencies,
    getObjectDeleteProtection,
    removeDependenciesForSource,
    rebuildMetadataDependenciesForOrganization,
    syncAppDependencies,
    syncDashboardWidgetDependencies,
    syncFieldDefinitionDependencies,
    syncValidationRuleDependencies,
} from "@/lib/metadata-dependencies";
import { normalizeStoredUniqueValue } from "@/lib/unique";
import { normalizeCustomLogicExpressionOrThrow } from "@/lib/validation/rule-logic";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MetadataDependencySourceType, Prisma } from "@prisma/client";
import path from "path";

const DEFAULT_WIDGET_COLOR = "#3b82f6";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

const widgetFilterSchema = z.object({
    id: z.string().min(1),
    fieldDefId: z.number().int().positive(),
    operator: z.string().min(1),
    value: z.string().optional(),
});

const widgetSchema = z.object({
    id: z.string().optional(),
    type: z.enum(["metric", "chart", "list"]),
    title: z.string().min(1, "Widget title is required"),
    colSpan: z.number().int().min(1).max(12).default(4),
    objectDefId: z.number().int().positive(),

    // Metric
    aggregation: z.enum(["count", "sum", "avg", "min", "max"]).optional(),
    valueFieldDefId: z.number().int().positive().optional(),

    // Chart
    chartType: z.enum(["bar", "line", "pie", "area"]).optional(),
    groupByFieldDefId: z.number().int().positive().optional(),

    // List
    fieldDefIds: z.array(z.number().int().positive()).optional(),
    systemFields: z.array(z.enum(["createdAt", "updatedAt"])).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    sortFieldDefId: z.number().int().positive().optional(),
    sortSystemField: z.enum(["createdAt", "updatedAt"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),

    // Filters
    filters: z.array(widgetFilterSchema).optional(),
    filterLogic: z.enum(["ALL", "ANY", "CUSTOM"]).optional(),
    filterExpression: z.string().optional(),
    ownerScope: z.enum(["any", "mine", "queue"]).optional(),
    ownerQueueId: z.number().int().positive().nullable().optional(),

    // Styling
    colorTheme: z.string().optional(),
    icon: z.string().nullable().optional(),
    color: z
        .string()
        .trim()
        .regex(HEX_COLOR_PATTERN, "Widget accent color must be a valid hex value."),
});

const widgetTypeToAllowedOperators: Record<string, string[]> = {
    text: ["equals", "not_equals", "contains", "not_contains", "is_blank", "is_not_blank"],
    number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_blank", "is_not_blank"],
    date: ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_blank", "is_not_blank"],
    datetime: ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_blank", "is_not_blank"],
    checkbox: ["equals", "not_equals", "is_blank", "is_not_blank"],
    lookup: ["is_blank", "is_not_blank"],
    picklist: ["equals", "not_equals", "is_blank", "is_not_blank"],
    default: ["equals", "not_equals", "contains", "not_contains", "is_blank", "is_not_blank"],
};

export async function saveDashboardLayout(appId: number, widgets: any[]) {
    try {
        const { organizationId } = await getUserContext();

        // Verify app ownership
        const app = await db.appDefinition.findUnique({
            where: { id: appId, organizationId },
            select: { id: true },
        });

        if (!app) throw new Error("App not found");

        const validatedWidgets = z.array(widgetSchema).parse(widgets || []);
        const objectIds = Array.from(new Set(validatedWidgets.map((w) => w.objectDefId)));
        const objectDefs = await db.objectDefinition.findMany({
            where: { organizationId, id: { in: objectIds } },
            include: {
                fields: {
                    include: { picklistOptions: true },
                },
            },
        });
        const objectMap = new Map(objectDefs.map((obj) => [obj.id, obj]));
        const queueIds = await db.queue.findMany({
            where: { organizationId },
            select: { id: true },
        });
        const queueIdSet = new Set(queueIds.map((q) => q.id));

        const normalizedWidgets = validatedWidgets.map((widget, index) => {
            const objectDef = objectMap.get(widget.objectDefId);
            if (!objectDef) {
                throw new Error("Invalid object selected for widget.");
            }

            const fieldMap = new Map(objectDef.fields.map((field) => [field.id, field]));

            // Validate fields per widget type
            if (widget.type === "metric") {
                const aggregation = widget.aggregation ?? "count";
                if (aggregation !== "count") {
                    const field = widget.valueFieldDefId ? fieldMap.get(widget.valueFieldDefId) : null;
                    if (!field || field.type !== "Number") {
                        throw new Error("Metric widgets must aggregate a Number field.");
                    }
                }
            }

            if (widget.type === "chart") {
                const groupField = widget.groupByFieldDefId ? fieldMap.get(widget.groupByFieldDefId) : null;
                if (!groupField || groupField.type !== "Picklist") {
                    throw new Error("Chart widgets must group by a Picklist field.");
                }
                if (widget.aggregation === "sum") {
                    const valueField = widget.valueFieldDefId ? fieldMap.get(widget.valueFieldDefId) : null;
                    if (!valueField || valueField.type !== "Number") {
                        throw new Error("Chart sum aggregation requires a Number field.");
                    }
                }
            }

            if (widget.type === "list") {
                const fieldIds = widget.fieldDefIds || [];
                const systemFields = widget.systemFields || [];
                for (const id of fieldIds) {
                    const field = fieldMap.get(id);
                    if (!field || ["TextArea", "File"].includes(field.type)) {
                        throw new Error("List widgets cannot include TextArea or File fields.");
                    }
                }
                for (const systemField of systemFields) {
                    if (!["createdAt", "updatedAt"].includes(systemField)) {
                        throw new Error("List widgets contain an invalid system field.");
                    }
                }
                if (widget.sortFieldDefId) {
                    const sortField = fieldMap.get(widget.sortFieldDefId);
                    if (!sortField || ["TextArea", "File"].includes(sortField.type)) {
                        throw new Error("List widgets cannot sort by TextArea or File fields.");
                    }
                }
                if (widget.sortSystemField && !["createdAt", "updatedAt"].includes(widget.sortSystemField)) {
                    throw new Error("List widgets contain an invalid sort field.");
                }
                if (widget.sortFieldDefId && widget.sortSystemField) {
                    throw new Error("List widgets must sort by either a field or a system date, not both.");
                }
            }

            const filters = widget.filters ?? [];
            for (const filter of filters) {
                const field = fieldMap.get(filter.fieldDefId);
                if (!field || ["TextArea", "File"].includes(field.type)) {
                    throw new Error("Widget filters cannot target TextArea or File fields.");
                }
                const operatorSet =
                    widgetTypeToAllowedOperators[field.type?.toLowerCase()] ||
                    widgetTypeToAllowedOperators.default;
                if (!operatorSet.includes(filter.operator)) {
                    throw new Error("Invalid filter operator for field type.");
                }
                const needsValue = !["is_blank", "is_not_blank"].includes(filter.operator);
                if (needsValue && (!filter.value || !filter.value.trim())) {
                    throw new Error("Filter value is required.");
                }
                if (field.type === "Picklist" && needsValue) {
                    const optionId = Number(filter.value);
                    const exists = field.picklistOptions?.some((opt) => opt.id === optionId);
                    if (!exists) {
                        throw new Error("Picklist filter must use a valid option.");
                    }
                }
            }

            const filterExpression =
                widget.filterLogic === "CUSTOM"
                    ? normalizeCustomLogicExpressionOrThrow(widget.filterExpression, filters.length)
                    : undefined;

            if (widget.ownerScope === "queue") {
                if (!widget.ownerQueueId || !queueIdSet.has(widget.ownerQueueId)) {
                    throw new Error("Record Owner queue must be a valid queue.");
                }
            }

            const ownerScope = widget.ownerScope ?? "any";
            const ownerQueueId = ownerScope === "queue" ? widget.ownerQueueId ?? null : null;

            const config = {
                objectDefId: widget.objectDefId,
                aggregation: widget.aggregation ?? (widget.type === "metric" ? "count" : undefined),
                valueFieldDefId: widget.valueFieldDefId,
                chartType: widget.chartType ?? (widget.type === "chart" ? "bar" : undefined),
                groupByFieldDefId: widget.groupByFieldDefId,
                fieldDefIds: widget.fieldDefIds ?? [],
                systemFields: widget.systemFields ?? [],
                limit: widget.limit ?? (widget.type === "list" ? 5 : undefined),
                sortFieldDefId: widget.sortFieldDefId,
                sortSystemField: widget.sortSystemField,
                sortDirection: widget.sortDirection ?? "desc",
                filters,
                filterLogic: widget.filterLogic ?? "ALL",
                filterExpression,
                colorTheme: widget.colorTheme ?? "default",
                icon: widget.icon ?? null,
                color: widget.color || DEFAULT_WIDGET_COLOR,
                ownerScope,
                ownerQueueId,
            };

            return {
                type: widget.type,
                title: widget.title,
                sortOrder: index,
                objectDefId: widget.objectDefId,
                layout: { colSpan: widget.colSpan },
                config,
            };
        });

        // Transaction: Delete old widgets -> Create new widgets
        await db.$transaction(async (tx) => {
            await tx.metadataDependency.deleteMany({
                where: {
                    organizationId,
                    sourceType: MetadataDependencySourceType.DASHBOARD_WIDGET,
                    sourceAppId: appId,
                },
            });

            await tx.dashboardWidget.deleteMany({
                where: { appId },
            });

            if (normalizedWidgets.length > 0) {
                await tx.dashboardWidget.createMany({
                    data: normalizedWidgets.map((widget) => ({
                        appId,
                        objectDefId: widget.objectDefId,
                        type: widget.type,
                        title: widget.title,
                        sortOrder: widget.sortOrder,
                        layout: widget.layout as Prisma.InputJsonValue,
                        config: widget.config as Prisma.InputJsonValue,
                    })),
                });
            }
        });

        const savedWidgets = await db.dashboardWidget.findMany({
            where: { appId },
            select: { id: true },
        });
        for (const widget of savedWidgets) {
            await syncDashboardWidgetDependencies(db, widget.id, organizationId);
        }

        revalidatePath(`/admin/apps/${appId}`);
        revalidatePath(`/admin/apps/${appId}/builder`);
        return { success: true };
    } catch (error: any) {
        if (error?.name === "ZodError" && Array.isArray(error?.errors)) {
            const first = error.errors[0];
            const path = Array.isArray(first?.path) ? first.path.join(".") : "widget";
            const message = first?.message || "Invalid widget configuration.";
            return { success: false, error: `Widget error (${path}): ${message}` };
        }
        console.error("Save Dashboard Error:", error);
        return { success: false, error: error.message || "Failed to save dashboard" };
    }
}


// Helper to get current user context
async function getUserContext() {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized");
    }
    const user = session.user as any;
    if (user.userType !== "admin") {
        throw new Error("Forbidden: Admin access required");
    }
    return { userId: parseInt(user.id), organizationId: parseInt(user.organizationId) };
}

// --- Object Definition Actions ---

const optionalNumber = z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().int().min(0).optional());

const createObjectSchema = z
    .object({
        label: z.string().min(1, "Label is required"),
        pluralLabel: z.string().min(1, "Plural Label is required"),
        description: z.string().optional(),
        icon: z.string().optional(),
        nameFieldType: z.enum(["Text", "AutoNumber"]).optional(),
        autoNumberPrefix: z.string().optional(),
        autoNumberMinDigits: optionalNumber,
        autoNumberStartValue: optionalNumber,
    })
    .superRefine((values, ctx) => {
        if (values.nameFieldType === "AutoNumber" && !values.autoNumberPrefix?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["autoNumberPrefix"],
                message: "Prefix is required for auto number.",
            });
        }
    });
const updateObjectIconSchema = z.object({
    objectDefId: z.number(),
    icon: z.string().min(1),
});

export async function createObjectDefinition(data: z.infer<typeof createObjectSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const validated = createObjectSchema.parse(data);

        // Auto-generate API name (slugify)
        const apiName = validated.label.toLowerCase().replace(/[^a-z0-9]/g, "_");

        if (isReservedObjectApiName(apiName)) {
            return { success: false, error: `Object API name "${apiName}" is reserved.` };
        }

        // Check uniqueness
        const existing = await db.objectDefinition.findUnique({
            where: {
                organizationId_apiName: {
                    organizationId,
                    apiName,
                },
            },
        });

        if (existing) {
            return { success: false, error: `Object with API Name "${apiName}" already exists.` };
        }

        const nameFieldType = validated.nameFieldType ?? "Text";
        const rawPrefix = validated.autoNumberPrefix?.trim() ?? "";
        const autoPrefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, "");
        const autoMinDigits = Number.isFinite(validated.autoNumberMinDigits)
            ? Math.min(10, Math.max(1, Math.floor(validated.autoNumberMinDigits ?? 0)))
            : 4;
        const autoStartValue = Number.isFinite(validated.autoNumberStartValue)
            ? Math.max(1, Math.floor(validated.autoNumberStartValue ?? 0))
            : 1;
        const nameFieldOptions =
            nameFieldType === "AutoNumber"
                ? {
                    autoNumber: {
                        prefix: autoPrefix,
                        minDigits: autoMinDigits,
                        nextValue: autoStartValue,
                    },
                }
                : undefined;

        const objectDef = await db.objectDefinition.create({
            data: {
                organizationId,
                apiName,
                label: validated.label,
                pluralLabel: validated.pluralLabel,
                description: validated.description,
                icon: validated.icon,
                isSystem: false,
                fields: {
                    create: [
                        {
                            apiName: "name",
                            label: "Name",
                            type: nameFieldType,
                            required: nameFieldType === "AutoNumber" ? false : true,
                            options: nameFieldOptions,
                        }
                    ]
                }
            },
        });

        const nameField = await db.fieldDefinition.findFirst({
            where: { objectDefId: objectDef.id, apiName: "name" },
            select: { id: true },
        });

        if (nameField) {
            await db.listView.create({
                data: {
                    organizationId,
                    objectDefId: objectDef.id,
                    name: `All ${validated.pluralLabel}`,
                    isDefault: true,
                    isGlobal: true,
                    criteria: {
                        logic: "ALL",
                        filters: [],
                        ownerScope: "any",
                        ownerQueueId: null,
                    },
                    columns: {
                        create: [
                            {
                                fieldDefId: nameField.id,
                                sortOrder: 0,
                            },
                        ],
                    },
                },
            });
        }

        revalidatePath("/admin/objects");
        return { success: true, data: objectDef };
    } catch (error: any) {
        console.error("Create Object Error:", error);
        return { success: false, error: error.message || "Failed to create object" };
    }
}

export async function updateObjectIcon(data: z.infer<typeof updateObjectIconSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const payload = updateObjectIconSchema.parse(data);

        const object = await db.objectDefinition.findUnique({
            where: { id: payload.objectDefId, organizationId },
        });

        if (!object) {
            return { success: false, error: "Object not found." };
        }

        await db.objectDefinition.update({
            where: { id: payload.objectDefId },
            data: { icon: payload.icon },
        });

        revalidatePath(`/admin/objects/${payload.objectDefId}`);
        revalidatePath(`/admin/objects`);
        return { success: true };
    } catch (error: any) {
        console.error("Update Object Icon Error:", error);
        return { success: false, error: error.message || "Failed to update object icon" };
    }
}

const updateObjectIdentitySchema = z.object({
    objectDefId: z.number(),
    label: z.string().min(1, "Label is required"),
    pluralLabel: z.string().min(1, "Plural Label is required"),
    description: z.string().optional(),
    icon: z.string().min(1, "Icon is required"),
    notifyOnAssignment: z.boolean().optional(),
    enableChatter: z.boolean().optional(),
});

export async function updateObjectIdentity(data: z.infer<typeof updateObjectIdentitySchema>) {
    try {
        const { organizationId } = await getUserContext();
        const payload = updateObjectIdentitySchema.parse(data);

        // Auto-update plural label if it wasn't customized?
        // for now we only update label.

        // We do NOT update apiName.

        const object = await db.objectDefinition.findUnique({
            where: { id: payload.objectDefId, organizationId },
        });

        if (!object) {
            return { success: false, error: "Object not found." };
        }

        await db.objectDefinition.update({
            where: { id: payload.objectDefId },
            data: {
                label: payload.label,
                pluralLabel: payload.pluralLabel,
                description: payload.description,
                icon: payload.icon,
                ...(object.apiName !== USER_OBJECT_API_NAME && payload.notifyOnAssignment !== undefined
                    ? { notifyOnAssignment: payload.notifyOnAssignment }
                    : {}),
                ...(object.apiName !== USER_OBJECT_API_NAME && payload.enableChatter !== undefined
                    ? { enableChatter: payload.enableChatter }
                    : {}),
            },
        });

        const fieldIds = await db.fieldDefinition.findMany({
            where: { objectDefId: payload.objectDefId },
            select: { id: true },
        });
        for (const field of fieldIds) {
            await syncFieldDefinitionDependencies(db, field.id, organizationId);
        }

        revalidatePath(`/admin/objects/${payload.objectDefId}`);
        revalidatePath(`/admin/objects`);
        return { success: true };
    } catch (error: any) {
        console.error("Update Object Identity Error:", error);
        return { success: false, error: error.message || "Failed to update object identity" };
    }
}

export async function deleteObjectDefinition(objectDefId: number) {
    try {
        const { organizationId } = await getUserContext();

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: objectDefId, organizationId },
            select: { id: true, label: true, isSystem: true },
        });

        if (!objectDef) {
            return { success: false, error: "Object not found." };
        }

        if (objectDef.isSystem) {
            return { success: false, error: "Standard objects cannot be deleted." };
        }

        const { dependencies, recordCount } = await getObjectDeleteProtection(organizationId, objectDefId);
        if (dependencies.length > 0 || recordCount > 0) {
            return {
                success: false,
                error: "Cannot delete: object is in use.",
                dependencies,
                recordCount,
            };
        }

        const fieldIds = await db.fieldDefinition.findMany({
            where: { objectDefId },
            select: { id: true },
        });
        const fieldIdList = fieldIds.map((field) => field.id);

        await db.$transaction(async (tx) => {
            await tx.metadataDependency.deleteMany({
                where: {
                    organizationId,
                    OR: [
                        { sourceObjectDefId: objectDefId },
                        { objectDefId },
                        ...(fieldIdList.length ? [{ fieldDefId: { in: fieldIdList } }] : []),
                    ],
                },
            });

            await tx.objectPermission.deleteMany({
                where: { objectDefId },
            });

            await tx.assignmentRule.deleteMany({
                where: { organizationId, objectDefId },
            });

            await tx.sharingRule.deleteMany({
                where: { organizationId, objectDefId },
            });

            await tx.objectDefinition.delete({
                where: { id: objectDefId },
            });
        });

        revalidatePath("/admin/objects");
        return { success: true };
    } catch (error: any) {
        console.error("Delete Object Error:", error);
        return { success: false, error: error.message || "Failed to delete object" };
    }
}

export async function rebuildDependencyIndex() {
    try {
        const { organizationId } = await getUserContext();
        await rebuildMetadataDependenciesForOrganization(organizationId);
        revalidatePath("/admin/objects");
        revalidatePath("/admin/apps");
        return { success: true };
    } catch (error: any) {
        console.error("Rebuild Dependency Index Error:", error);
        return { success: false, error: error.message || "Failed to rebuild dependency index" };
    }
}

// --- Field Definition Actions ---

const optionalId = z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().int().min(1).optional());

const picklistOptionSchema = z.object({
    id: optionalId,
    label: z.string().min(1, "Option label is required"),
    apiName: z.string().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
});

const createFieldSchema = z
    .object({
        objectDefId: z.number(),
        label: z.string().min(1, "Label is required"),
        type: z.enum(["Text", "TextArea", "Number", "Date", "DateTime", "Checkbox", "Phone", "Email", "Url", "Lookup", "Picklist", "File", "AutoNumber"]),
        required: z.boolean().default(false),
        isExternalId: z.boolean().default(false),
        isUnique: z.boolean().default(false),
        picklistOptions: z.array(picklistOptionSchema).optional(),
        lookupTargetId: z.string().optional(), // ID of target object for lookup (string from form)
        decimalPlaces: optionalNumber,
        fileType: z.enum(["images", "pdf", "docx", "all"]).optional(),
        displayMode: z.enum(["inline", "link"]).optional(),
        autoNumberPrefix: z.string().optional(),
        autoNumberMinDigits: optionalNumber,
        autoNumberStartValue: optionalNumber,
    })
    .superRefine((values, ctx) => {
        if (values.type === "AutoNumber" && !values.autoNumberPrefix?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["autoNumberPrefix"],
                message: "Prefix is required for auto number.",
            });
        }
    });

function normalizePicklistOptions(rawOptions: z.infer<typeof picklistOptionSchema>[] | undefined) {
    const options = rawOptions ?? [];
    const seen = new Set<string>();
    const seenLabels = new Set<string>();

    return options.map((option, index) => {
        const label = option.label.trim();
        const candidate = option.apiName?.trim() || label;
        const apiName = normalizePicklistApiName(candidate);
        const labelKey = label.toLowerCase();

        if (!apiName) {
            throw new Error("Picklist option API name is required.");
        }
        if (seen.has(apiName)) {
            throw new Error(`Picklist option API name "${apiName}" must be unique.`);
        }
        if (!label) {
            throw new Error("Picklist option label is required.");
        }
        if (seenLabels.has(labelKey)) {
            throw new Error(`Picklist option label "${label}" must be unique.`);
        }
        seen.add(apiName);
        seenLabels.add(labelKey);

        return {
            id: option.id,
            apiName,
            label,
            sortOrder: option.sortOrder ?? index,
            isActive: option.isActive ?? true,
        };
    });
}

const UNIQUE_ALLOWED_TYPES = new Set(["Text", "Email", "Phone"]);
const EXTERNAL_ID_ALLOWED_TYPES = new Set(["Text"]);

async function getUniqueConflictSummary(fieldDefId: number, fieldType: string) {
    const values = await db.fieldData.findMany({
        where: {
            fieldDefId,
            OR: [{ valueText: { not: null } }, { valueSearch: { not: null } }],
        },
        select: { recordId: true, valueText: true, valueSearch: true },
    });

    const valueMap = new Map<string, number[]>();

    for (const row of values) {
        const key = normalizeStoredUniqueValue(fieldType, row.valueText, row.valueSearch);
        if (!key) continue;
        const list = valueMap.get(key) ?? [];
        list.push(row.recordId);
        valueMap.set(key, list);
    }

    const duplicates = Array.from(valueMap.entries())
        .filter(([, recordIds]) => recordIds.length > 1)
        .map(([value, recordIds]) => ({ value, recordIds }));

    return duplicates;
}

async function syncPicklistOptions(
    tx: Prisma.TransactionClient,
    organizationId: number,
    fieldDefId: number,
    nextOptions: ReturnType<typeof normalizePicklistOptions>
) {
    const existing = await tx.picklistOption.findMany({
        where: { fieldDefId },
        select: { id: true, apiName: true, label: true, isActive: true },
    });
    const existingById = new Map(existing.map((opt) => [opt.id, opt]));
    const existingByApi = new Map(existing.map((opt) => [opt.apiName, opt]));
    const existingByLabel = new Map(existing.map((opt) => [opt.label.toLowerCase(), opt]));
    const touched = new Set<number>();

    for (const option of nextOptions) {
        if (option.id && !existingById.has(option.id)) {
            throw new Error("Picklist option not found.");
        }

        if (option.id) {
            const conflict = existingByApi.get(option.apiName);
            if (conflict && conflict.id !== option.id) {
                throw new Error(`Picklist option API name "${option.apiName}" is already in use.`);
            }
            const labelConflict = existingByLabel.get(option.label.toLowerCase());
            if (labelConflict && labelConflict.id !== option.id) {
                throw new Error(`Picklist option label "${option.label}" is already in use.`);
            }
        } else {
            const apiConflict = existingByApi.get(option.apiName);
            if (apiConflict) {
                throw new Error(`Picklist option API name "${option.apiName}" is already in use.`);
            }
            const labelConflict = existingByLabel.get(option.label.toLowerCase());
            if (labelConflict) {
                throw new Error(`Picklist option label "${option.label}" is already in use.`);
            }
        }

        const matched = option.id
            ? existingById.get(option.id)
            : existingByApi.get(option.apiName);

        if (matched) {
            await tx.picklistOption.update({
                where: { id: matched.id },
                data: {
                    apiName: option.apiName,
                    label: option.label,
                    sortOrder: option.sortOrder,
                    isActive: option.isActive,
                },
            });
            touched.add(matched.id);
            continue;
        }

        await tx.picklistOption.create({
            data: {
                organizationId,
                fieldDefId,
                apiName: option.apiName,
                label: option.label,
                sortOrder: option.sortOrder,
                isActive: option.isActive,
            },
        });
    }

    const inactiveIds = existing
        .filter((opt) => !touched.has(opt.id) && opt.isActive)
        .map((opt) => opt.id);

    if (inactiveIds.length) {
        // Soft-disable removed options to avoid breaking existing record data.
        await tx.picklistOption.updateMany({
            where: { id: { in: inactiveIds } },
            data: { isActive: false },
        });
    }
}

export async function createFieldDefinition(data: z.infer<typeof createFieldSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const validated = createFieldSchema.parse(data);

        // Auto-generate API name
        const apiName = validated.label.toLowerCase().replace(/[^a-z0-9]/g, "_");

        // Check uniqueness within object
        const existing = await db.fieldDefinition.findUnique({
            where: {
                objectDefId_apiName: {
                    objectDefId: validated.objectDefId,
                    apiName,
                },
            },
        });

        if (existing) {
            return { success: false, error: `Field with API Name "${apiName}" already exists on this object.` };
        }

        const fieldType = validated.type;
        const isExternalId = fieldType === "AutoNumber" ? false : validated.isExternalId;
        const isUnique = fieldType === "AutoNumber" ? false : validated.isUnique;
        const externalIdAllowed = EXTERNAL_ID_ALLOWED_TYPES.has(fieldType);
        const uniqueAllowed = UNIQUE_ALLOWED_TYPES.has(fieldType);
        if (isExternalId && !externalIdAllowed) {
            return { success: false, error: "External ID can only be set on Text fields." };
        }
        if (isUnique && !uniqueAllowed) {
            return { success: false, error: "Unique can only be set on Text/Email/Phone fields." };
        }
        if (isExternalId && isUnique) {
            return { success: false, error: "External ID and Unique cannot both be enabled." };
        }

        if (isExternalId) {
            const existingExternal = await db.fieldDefinition.findFirst({
                where: {
                    objectDefId: validated.objectDefId,
                    isExternalId: true,
                },
                select: { id: true },
            });
            if (existingExternal) {
                return { success: false, error: "This object already has an External ID field." };
            }
        }
        const picklistOptions =
            fieldType === "Picklist" ? normalizePicklistOptions(validated.picklistOptions) : [];

        if (fieldType === "Picklist" && picklistOptions.length === 0) {
            return { success: false, error: "Picklist fields need at least one option." };
        }

        // Prepare options JSON for non-picklist config.
        let optionsJson: any = null;
        if (fieldType === "Number") {
            if (validated.decimalPlaces !== undefined) {
                optionsJson = { decimalPlaces: validated.decimalPlaces };
            }
        } else if (fieldType === "AutoNumber") {
            const rawPrefix = validated.autoNumberPrefix?.trim() ?? "";
            const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, "");
            const minDigits = Number.isFinite(validated.autoNumberMinDigits)
                ? Math.min(10, Math.max(1, Math.floor(validated.autoNumberMinDigits ?? 0)))
                : 4;
            const startValue = Number.isFinite(validated.autoNumberStartValue)
                ? Math.max(1, Math.floor(validated.autoNumberStartValue ?? 0))
                : 1;
            optionsJson = {
                autoNumber: {
                    prefix,
                    minDigits,
                    nextValue: startValue,
                },
            };
        } else if (fieldType === "File") {
            const allowedTypes = validated.fileType ?? "all";
            const nextOptions: Record<string, any> = { allowedTypes };
            if (allowedTypes === "images") {
                nextOptions.displayMode = validated.displayMode ?? "link";
            }
            optionsJson = nextOptions;
        }

        // Parse lookup target.
        let lookupTargetId: number | null = null;
        if (fieldType === "Lookup") {
            if (!validated.lookupTargetId) {
                return { success: false, error: "Lookup fields must have a target object." };
            }

            const parsedLookupTargetId = parseInt(validated.lookupTargetId, 10);
            if (!Number.isInteger(parsedLookupTargetId)) {
                return { success: false, error: "Lookup target object is invalid." };
            }
            lookupTargetId = parsedLookupTargetId;
        }

        if (lookupTargetId !== null) {
            const targetObject = await db.objectDefinition.findFirst({
                where: { id: lookupTargetId, organizationId },
                select: { id: true },
            });
            if (!targetObject) {
                return { success: false, error: "Lookup target object not found." };
            }
        }

        if (fieldType === "Lookup" && lookupTargetId === null) {
            return { success: false, error: "Lookup fields must have a target object." };
        }

        const fieldDef = await db.$transaction(async (tx) => {
            const created = await tx.fieldDefinition.create({
                data: {
                    objectDefId: validated.objectDefId,
                    apiName,
                    label: validated.label,
                    type: validated.type,
                    required: fieldType === "AutoNumber" ? false : validated.required,
                    isExternalId: fieldType === "AutoNumber" ? false : validated.isExternalId,
                    isUnique,
                    options: optionsJson,
                    lookupTargetId,
                },
            });

            if (fieldType === "Picklist") {
                await tx.picklistOption.createMany({
                    data: picklistOptions.map((option) => ({
                        organizationId,
                        fieldDefId: created.id,
                        apiName: option.apiName,
                        label: option.label,
                        sortOrder: option.sortOrder,
                        isActive: option.isActive,
                    })),
                });
            }

            return created;
        });

        await syncFieldDefinitionDependencies(db, fieldDef.id, organizationId);

        revalidatePath(`/admin/objects/${validated.objectDefId}`);
        return { success: true, data: fieldDef };
    } catch (error: any) {
        console.error("Create Field Error:", error);
        return { success: false, error: error.message || "Failed to create field" };
    }
}

export async function updateFieldDefinition(fieldId: number, data: z.infer<typeof createFieldSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const validated = createFieldSchema.parse(data);

        // Ensure field belongs to org via objectDef
        const existingField = await db.fieldDefinition.findFirst({
            where: {
                id: fieldId,
                objectDef: { organizationId },
            },
        });

        if (!existingField) {
            return { success: false, error: "Field not found" };
        }

        if (
            existingField.objectDefId &&
            existingField.apiName === USER_ID_FIELD_API_NAME &&
            existingField.objectDefId === validated.objectDefId
        ) {
            return { success: false, error: "The UserId field cannot be modified." };
        }

        if (existingField.apiName === "name" && validated.required !== existingField.required) {
            return { success: false, error: "The Name field is always required." };
        }

        const fieldType = existingField.type;
        const isExternalId = fieldType === "AutoNumber" ? false : validated.isExternalId;
        const nextIsUnique = fieldType === "AutoNumber" ? false : validated.isUnique;
        const externalIdAllowed = EXTERNAL_ID_ALLOWED_TYPES.has(fieldType);
        const uniqueAllowed = UNIQUE_ALLOWED_TYPES.has(fieldType);
        if (isExternalId && !externalIdAllowed) {
            return { success: false, error: "External ID can only be set on Text fields." };
        }
        if (nextIsUnique && !uniqueAllowed) {
            return { success: false, error: "Unique can only be set on Text/Email/Phone fields." };
        }
        if (isExternalId && nextIsUnique) {
            return { success: false, error: "External ID and Unique cannot both be enabled." };
        }

        if (isExternalId) {
            const existingExternal = await db.fieldDefinition.findFirst({
                where: {
                    objectDefId: existingField.objectDefId,
                    isExternalId: true,
                    id: { not: fieldId },
                },
                select: { id: true },
            });
            if (existingExternal) {
                return { success: false, error: "This object already has an External ID field." };
            }
        }
        const enablingUnique = nextIsUnique && !existingField.isUnique;
        const enablingExternalId = isExternalId && !existingField.isExternalId;
        if (enablingUnique || enablingExternalId) {
            const duplicates = await getUniqueConflictSummary(fieldId, fieldType);
            if (duplicates.length > 0) {
                const sample = duplicates[0];
                const reason = enablingExternalId ? "External ID" : "Unique";
                return {
                    success: false,
                    error: `Cannot enable ${reason}: duplicates found for "${validated.label}". Example value "${sample.value}" is used by records ${sample.recordIds.join(", ")}.`,
                };
            }
        }
        const picklistOptions =
            fieldType === "Picklist" ? normalizePicklistOptions(validated.picklistOptions) : [];

        if (fieldType === "Picklist" && picklistOptions.length === 0) {
            return { success: false, error: "Picklist fields need at least one option." };
        }

        // Prepare options JSON for non-picklist config.
        let optionsJson: any = null;
        if (fieldType === "Number") {
            if (validated.decimalPlaces !== undefined) {
                optionsJson = { decimalPlaces: validated.decimalPlaces };
            }
        } else if (fieldType === "AutoNumber") {
            const rawPrefix = validated.autoNumberPrefix?.trim() ?? "";
            const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, "");
            const minDigits = Number.isFinite(validated.autoNumberMinDigits)
                ? Math.min(10, Math.max(1, Math.floor(validated.autoNumberMinDigits ?? 0)))
                : 4;
            const existingOptions = existingField.options && !Array.isArray(existingField.options)
                ? (existingField.options as any)
                : {};
            const nextValue = Number.isFinite(existingOptions?.autoNumber?.nextValue)
                ? existingOptions.autoNumber.nextValue
                : 1;
            optionsJson = {
                ...existingOptions,
                autoNumber: {
                    prefix,
                    minDigits,
                    nextValue,
                },
            };
        } else if (fieldType === "File") {
            const allowedTypes = validated.fileType ?? "all";
            const nextOptions: Record<string, any> = { allowedTypes };
            if (allowedTypes === "images") {
                nextOptions.displayMode = validated.displayMode ?? "link";
            }
            optionsJson = nextOptions;
        }

        // Parse lookup target (locked after creation).
        let lookupTargetId: number | null = null;
        if (fieldType === "Lookup") {
            if (!existingField.lookupTargetId) {
                return { success: false, error: "Lookup field is missing a target object." };
            }
            if (!validated.lookupTargetId) {
                return { success: false, error: "Lookup fields must have a target object." };
            }

            const parsedLookupTargetId = parseInt(validated.lookupTargetId, 10);
            if (!Number.isInteger(parsedLookupTargetId)) {
                return { success: false, error: "Lookup target object is invalid." };
            }
            if (parsedLookupTargetId !== existingField.lookupTargetId) {
                return {
                    success: false,
                    error: "Lookup target cannot be changed after the field is created.",
                };
            }

            lookupTargetId = existingField.lookupTargetId;
        }

        if (lookupTargetId !== null) {
            const targetObject = await db.objectDefinition.findFirst({
                where: { id: lookupTargetId, organizationId },
                select: { id: true },
            });
            if (!targetObject) {
                return { success: false, error: "Lookup target object not found." };
            }
        }

        await db.$transaction(async (tx) => {
            await tx.fieldDefinition.update({
                where: { id: fieldId },
                data: {
                    label: validated.label,
                    // Note: Changing type or apiName is risky and usually blocked in real CRMs.
                    // For this openCRM, we'll allow label, required, and options changes.
                    // Lookup target is immutable after creation.
                    // We will NOT allow changing API Name or Type to keep it simple and safe for now.
                    required: fieldType === "AutoNumber" ? false : validated.required,
                    isExternalId: fieldType === "AutoNumber" ? false : isExternalId,
                    isUnique: nextIsUnique,
                    options: optionsJson,
                    lookupTargetId,
                },
            });

            if (fieldType === "Picklist") {
                await syncPicklistOptions(tx, organizationId, fieldId, picklistOptions);
            }
        });

        await syncFieldDefinitionDependencies(db, fieldId, organizationId);

        revalidatePath(`/admin/objects/${validated.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Update Field Error:", error);
        return { success: false, error: error.message || "Failed to update field" };
    }
}

export async function deleteFieldDefinition(fieldId: number, objectDefId: number) {
    try {
        const { organizationId } = await getUserContext();

        // Ensure field belongs to org
        const existingField = await db.fieldDefinition.findFirst({
            where: {
                id: fieldId,
                objectDef: { organizationId },
            },
        });

        if (!existingField) {
            return { success: false, error: "Field not found" };
        }

        // Prevent deletion of "name" field
        if (existingField.apiName === "name") {
            return { success: false, error: "The 'Name' field cannot be deleted." };
        }
        if (existingField.apiName === USER_ID_FIELD_API_NAME) {
            return { success: false, error: "The 'UserId' field cannot be deleted." };
        }

        const dependencies = await getFieldDependencies(organizationId, fieldId);
        if (dependencies.length > 0) {
            return {
                success: false,
                error: "Cannot delete: field is in use.",
                dependencies,
            };
        }

        const fileAttachmentDelegate = (db as any).fileAttachment;
        const attachmentRows = fileAttachmentDelegate?.findMany
            ? await fileAttachmentDelegate.findMany({
                where: { fieldDefId: fieldId, organizationId },
                select: { storagePath: true },
            })
            : [];

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.FIELD_DEFINITION, fieldId);
            await tx.fieldDefinition.delete({
                where: { id: fieldId },
            });
        });

        const attachments = attachmentRows.filter(
            (attachment: { storagePath?: string | null }) => Boolean(attachment.storagePath)
        );
        if (attachments.length > 0) {
            await Promise.all(
                attachments.map(async (attachment: { storagePath?: string | null }) => {
                    if (!attachment.storagePath) return;
                    const absolutePath = resolveStoragePath(attachment.storagePath);
                    await deleteFileSafe(absolutePath);
                    await deleteFolderSafe(path.dirname(absolutePath));
                })
            );
        }

        revalidatePath(`/admin/objects/${objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Field Error:", error);
        return { success: false, error: error.message || "Failed to delete field" };
    }
}

export async function checkFieldDeleteDefinition(fieldId: number, objectDefId: number) {
    try {
        const { organizationId } = await getUserContext();

        const existingField = await db.fieldDefinition.findFirst({
            where: {
                id: fieldId,
                objectDefId,
                objectDef: { organizationId },
            },
            select: {
                id: true,
                label: true,
                apiName: true,
            },
        });

        if (!existingField) {
            return { success: false, error: "Field not found" };
        }

        if (existingField.apiName === "name") {
            return { success: false, error: "The 'Name' field cannot be deleted." };
        }
        if (existingField.apiName === USER_ID_FIELD_API_NAME) {
            return { success: false, error: "The 'UserId' field cannot be deleted." };
        }

        const dependencies = await getFieldDependencies(organizationId, fieldId);

        return {
            success: true,
            canDelete: dependencies.length === 0,
            dependencies,
        };
    } catch (error: any) {
        console.error("Check Field Delete Error:", error);
        return { success: false, error: error.message || "Failed to check field delete." };
    }
}

// --- App Definition Actions ---

const createAppSchema = z.object({
    name: z.string().min(1, "Name is required"),
    apiName: z.string().min(1, "API Name is required"),
    description: z.string().optional(),
    icon: z.string().optional(),
    navItems: z.array(z.number()), // Array of ObjectDefinition IDs
});

export async function createApp(data: z.infer<typeof createAppSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const validated = createAppSchema.parse(data);

        const navItems = Array.from(new Set(validated.navItems));
        const apiName = normalizeApiName(validated.apiName || validated.name);
        if (!apiName) {
            return { success: false, error: "API Name is required." };
        }
        if (navItems.length > 0) {
            const objectDefs = await db.objectDefinition.findMany({
                where: { organizationId, id: { in: navItems } },
                select: { id: true },
            });
            if (objectDefs.length !== navItems.length) {
                return { success: false, error: "One or more objects were not found." };
            }
        }

        const result = await db.$transaction(async (tx) => {
            // Create App
            const app = await tx.appDefinition.create({
                data: {
                    organizationId,
                    name: validated.name,
                    apiName,
                    description: validated.description,
                    icon: validated.icon,
                },
            });

            // Create Nav Items
            if (navItems.length > 0) {
                await tx.appNavItem.createMany({
                    data: navItems.map((objId, index) => ({
                        appId: app.id,
                        objectDefId: objId,
                        sortOrder: index,
                    })),
                });
            }

            return app;
        });

        await syncAppDependencies(db, result.id, organizationId);

        revalidatePath("/admin/apps");
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Create App Error:", error);
        if (error?.code === "P2002") {
            const target = error.meta?.target;
            if (Array.isArray(target)) {
                if (target.includes("name")) {
                    return { success: false, error: "An app with this name already exists." };
                }
                if (target.includes("apiName")) {
                    return { success: false, error: "An app with this API Name already exists." };
                }
            }
            return { success: false, error: "This app name or API Name is already in use." };
        }
        return { success: false, error: error.message || "Failed to create app" };
    }
}

export async function updateApp(appId: number, data: z.infer<typeof createAppSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const validated = createAppSchema.parse(data);

        const navItems = Array.from(new Set(validated.navItems));
        const apiName = normalizeApiName(validated.apiName || validated.name);
        if (!apiName) {
            return { success: false, error: "API Name is required." };
        }
        if (navItems.length > 0) {
            const objectDefs = await db.objectDefinition.findMany({
                where: { organizationId, id: { in: navItems } },
                select: { id: true },
            });
            if (objectDefs.length !== navItems.length) {
                return { success: false, error: "One or more objects were not found." };
            }
        }

        await db.$transaction(async (tx) => {
            // Update App Details
            await tx.appDefinition.update({
                where: { id: appId, organizationId },
                data: {
                    name: validated.name,
                    apiName,
                    description: validated.description,
                    icon: validated.icon,
                },
            });

            // Update Nav Items (Delete all and recreate)
            await tx.appNavItem.deleteMany({
                where: { appId },
            });

            if (navItems.length > 0) {
                await tx.appNavItem.createMany({
                    data: navItems.map((objId, index) => ({
                        appId,
                        objectDefId: objId,
                        sortOrder: index,
                    })),
                });
            }
        });

        await syncAppDependencies(db, appId, organizationId);

        revalidatePath("/admin/apps");
        revalidatePath(`/admin/apps/${appId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Update App Error:", error);
        if (error?.code === "P2002") {
            const target = error.meta?.target;
            if (Array.isArray(target)) {
                if (target.includes("name")) {
                    return { success: false, error: "An app with this name already exists." };
                }
                if (target.includes("apiName")) {
                    return { success: false, error: "An app with this API Name already exists." };
                }
            }
            return { success: false, error: "This app name or API Name is already in use." };
        }
        return { success: false, error: error.message || "Failed to update app" };
    }
}

export async function deleteApp(appId: number) {
    try {
        const { organizationId } = await getUserContext();

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.APP, appId);
            await tx.metadataDependency.deleteMany({
                where: {
                    organizationId,
                    sourceType: MetadataDependencySourceType.DASHBOARD_WIDGET,
                    sourceAppId: appId,
                },
            });
            await tx.appDefinition.delete({
                where: { id: appId, organizationId },
            });
        });

        revalidatePath("/admin/apps");
        return { success: true };
    } catch (error: any) {
        console.error("Delete App Error:", error);
        return { success: false, error: error.message || "Failed to delete app" };
    }
}

export async function getObjectFields(objectApiName: string) {
    try {
        const { organizationId } = await getUserContext();

        const objectDef = await db.objectDefinition.findFirst({
            where: {
                apiName: objectApiName,
                organizationId,
            },
            include: {
                fields: {
                    orderBy: { label: "asc" },
                },
            },
        });

        if (!objectDef) {
            return { success: false, error: "Object not found" };
        }

        return { success: true, data: objectDef.fields };
    } catch (error: any) {
        console.error("Get Object Fields Error:", error);
        return { success: false, error: "Failed to fetch fields" };
    }
}

const validationConditionSchema = z.object({
    fieldDefId: z.number().optional(),
    systemField: z.enum(["currentUserPermissionSetId"]).optional(),
    permissionSetId: z.number().optional(),
    operator: z.string(),
    compareSource: z.enum(["value", "field"]).default("value"),
    compareValue: z.string().optional(),
    compareFieldId: z.number().optional(),
}).refine((data) => data.fieldDefId || data.systemField, {
    message: "Each condition needs a field or system source.",
});

const validationRuleSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1),
    description: z.string().optional(),
    logicOperator: z.enum(["ALL", "ANY", "CUSTOM"]).default("ALL"),
    logicExpression: z.string().optional(),
    errorMessage: z.string().min(1),
    errorFieldId: z.number().optional(),
    errorPlacement: z.enum(["toast", "inline"]).default("toast"),
    isActive: z.boolean().default(true),
    conditions: z.array(validationConditionSchema).min(1, "Add at least one condition"),
});

const UNSUPPORTED_VALIDATION_RULE_TYPES = new Set(["File"]);
const CHARACTER_LENGTH_OPERATORS = new Set([
    "character_length_lt",
    "character_length_lte",
    "character_length_eq",
    "character_length_gte",
    "character_length_gt",
]);
const TEXTAREA_ALLOWED_OPERATORS = new Set([
    "is_blank",
    "is_not_blank",
    ...CHARACTER_LENGTH_OPERATORS,
]);
const TEXT_FIELD_TYPES = new Set(["Text", "Email", "Phone", "Url", "TextArea"]);
const PICKLIST_ALLOWED_OPERATORS = new Set([
    "equals",
    "not_equals",
    "is_blank",
    "is_not_blank",
]);

function operatorRequiresValue(operator: string) {
    return !["is_blank", "is_not_blank"].includes(operator);
}

export async function createValidationRule(data: z.infer<typeof validationRuleSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const payload = validationRuleSchema.parse(data);

        if (payload.errorPlacement === "inline" && !payload.errorFieldId) {
            throw new Error("Select which field should display the inline error.");
        }

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: payload.objectDefId, organizationId },
            include: {
                fields: {
                    include: {
                        picklistOptions: { orderBy: { sortOrder: "asc" } },
                    },
                },
            },
        });

        if (!objectDef) {
            return { success: false, error: "Object not found." };
        }

        const fieldMap = new Map(objectDef.fields.map((field) => [field.id, field]));

        const sanitizedConditions = payload.conditions.map((condition, index) => {
            if (condition.systemField === "currentUserPermissionSetId") {
                if (!condition.permissionSetId) {
                    throw new Error(`Select a permission set for condition ${index + 1}`);
                }
                const operator = condition.operator || "has_permission";
                if (!["has_permission", "not_has_permission"].includes(operator)) {
                    throw new Error(`Choose a permission operator for condition ${index + 1}`);
                }
                return {
                    fieldDefId: null,
                    systemField: "currentUserPermissionSetId",
                    permissionSetId: condition.permissionSetId,
                    operator,
                    compareSource: "value",
                    compareValue: "",
                    compareFieldId: null,
                };
            }

            if (!condition.fieldDefId) {
                throw new Error(`Select a field for condition ${index + 1}`);
            }

            const conditionField = condition.fieldDefId ? fieldMap.get(condition.fieldDefId) : null;
            const isCharacterLength = CHARACTER_LENGTH_OPERATORS.has(condition.operator);
            const isPicklist = conditionField?.type === "Picklist";
            if (conditionField && UNSUPPORTED_VALIDATION_RULE_TYPES.has(conditionField.type)) {
                throw new Error("File fields cannot be used in validation conditions.");
            }
            if (conditionField && isCharacterLength && !TEXT_FIELD_TYPES.has(conditionField.type)) {
                throw new Error("Character length conditions can only be used with text fields.");
            }
            if (conditionField && conditionField.type === "TextArea" && !TEXTAREA_ALLOWED_OPERATORS.has(condition.operator)) {
                throw new Error("TextArea fields can only use character length or blank operators.");
            }
            if (conditionField && isPicklist && !PICKLIST_ALLOWED_OPERATORS.has(condition.operator)) {
                throw new Error("Picklist fields can only use equals, not equals, or blank operators.");
            }

            let compareValue = condition.compareValue ?? "";
            let compareFieldId = condition.compareFieldId ?? null;

            if (condition.compareSource === "value") {
                if (operatorRequiresValue(condition.operator) && !compareValue.trim()) {
                    throw new Error(`Provide a compare value for condition ${index + 1}`);
                }
                if (isPicklist && operatorRequiresValue(condition.operator)) {
                    const picklistId = Number(compareValue);
                    if (!Number.isFinite(picklistId)) {
                        throw new Error(`Select a valid picklist option for condition ${index + 1}`);
                    }
                    const match = (conditionField as any).picklistOptions?.find(
                        (opt: any) => opt.id === picklistId && opt.isActive !== false
                    );
                    if (!match) {
                        throw new Error(`Picklist option is not active for condition ${index + 1}`);
                    }
                }
                if (isCharacterLength) {
                    const parsed = Number(compareValue);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                        throw new Error(`Enter a valid character length for condition ${index + 1}`);
                    }
                }
                compareFieldId = null;
            } else if (condition.compareSource === "field") {
                if (isPicklist) {
                    throw new Error(`Picklist conditions must compare against a fixed value (condition ${index + 1}).`);
                }
                if (isCharacterLength) {
                    throw new Error(`Character length conditions must compare against a static value (condition ${index + 1}).`);
                }
                if (!compareFieldId) {
                    throw new Error(`Select a comparison field for condition ${index + 1}`);
                }
                if (!fieldMap.has(compareFieldId)) {
                    throw new Error(`Comparison field not found for condition ${index + 1}`);
                }
                const compareField = fieldMap.get(compareFieldId);
                if (compareField && UNSUPPORTED_VALIDATION_RULE_TYPES.has(compareField.type)) {
                    throw new Error("File fields cannot be used in validation conditions.");
                }
                if (compareField?.type === "TextArea") {
                    throw new Error("TextArea fields cannot be used for field-to-field comparisons.");
                }
                compareValue = "";
            }

            if (condition.fieldDefId && !fieldMap.has(condition.fieldDefId)) {
                throw new Error(`Field not found for condition ${index + 1}`);
            }

            if (["is_blank", "is_not_blank"].includes(condition.operator)) {
                // Enforce specific rules for blank operators
                if (condition.compareSource !== "value") {
                    // Force it to value if frontend sent something else (though UI blocks it)
                    condition.compareSource = "value";
                }
                if (compareValue !== "true" && compareValue !== "false") {
                    // Default to true if invalid
                    compareValue = "true";
                }
                compareFieldId = null;
            }

            return {
                fieldDefId: condition.fieldDefId ?? null,
                systemField: null,
                permissionSetId: null,
                operator: condition.operator,
                compareSource: condition.compareSource,
                compareValue: compareValue ?? "",
                compareFieldId,
            };
        });

        const logicExpression =
            payload.logicOperator === "CUSTOM"
                ? normalizeCustomLogicExpressionOrThrow(payload.logicExpression, sanitizedConditions.length, "(1 OR 2) AND 3")
                : null;

        let createdRuleId: number | null = null;
        await db.$transaction(async (tx) => {
            const rule = await tx.validationRule.create({
                data: {
                    objectDefId: payload.objectDefId,
                    name: payload.name,
                    description: payload.description,
                    logicOperator: payload.logicOperator,
                    logicExpression,
                    errorMessage: payload.errorMessage,
                    errorFieldId: payload.errorFieldId ?? null,
                    errorPlacement: payload.errorPlacement,
                    isActive: payload.isActive,
                },
            });
            createdRuleId = rule.id;

            await tx.validationCondition.createMany({
                data: sanitizedConditions.map((condition) => ({
                    ...condition,
                    ruleId: rule.id,
                })),
            });
        });

        if (createdRuleId) {
            await syncValidationRuleDependencies(db, createdRuleId, organizationId);
        }

        revalidatePath(`/admin/objects/${payload.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Create Validation Rule Error:", error);
        return { success: false, error: error.message || "Failed to create validation rule" };
    }
}

export async function updateValidationRule(ruleId: number, data: z.infer<typeof validationRuleSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const payload = validationRuleSchema.parse(data);

        if (payload.errorPlacement === "inline" && !payload.errorFieldId) {
            throw new Error("Select which field should display the inline error.");
        }

        const rule = await db.validationRule.findUnique({
            where: { id: ruleId },
            include: {
                objectDef: {
                    include: {
                        fields: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                        },
                    },
                },
            },
        });

        if (!rule || rule.objectDefId !== payload.objectDefId || rule.objectDef.organizationId !== organizationId) {
            return { success: false, error: "Validation rule not found." };
        }

        const fieldMap = new Map(rule.objectDef.fields.map((field) => [field.id, field]));

        const sanitizedConditions = payload.conditions.map((condition, index) => {
            if (condition.systemField === "currentUserPermissionSetId") {
                if (!condition.permissionSetId) {
                    throw new Error(`Select a permission set for condition ${index + 1}`);
                }
                const operator = condition.operator || "has_permission";
                if (!["has_permission", "not_has_permission"].includes(operator)) {
                    throw new Error(`Choose a permission operator for condition ${index + 1}`);
                }
                return {
                    fieldDefId: null,
                    systemField: "currentUserPermissionSetId",
                    permissionSetId: condition.permissionSetId,
                    operator,
                    compareSource: "value",
                    compareValue: "",
                    compareFieldId: null,
                };
            }

            if (!condition.fieldDefId) {
                throw new Error(`Select a field for condition ${index + 1}`);
            }

            const conditionField = condition.fieldDefId ? fieldMap.get(condition.fieldDefId) : null;
            const isCharacterLength = CHARACTER_LENGTH_OPERATORS.has(condition.operator);
            const isPicklist = conditionField?.type === "Picklist";
            if (conditionField && UNSUPPORTED_VALIDATION_RULE_TYPES.has(conditionField.type)) {
                throw new Error("File fields cannot be used in validation conditions.");
            }
            if (conditionField && isCharacterLength && !TEXT_FIELD_TYPES.has(conditionField.type)) {
                throw new Error("Character length conditions can only be used with text fields.");
            }
            if (conditionField && conditionField.type === "TextArea" && !TEXTAREA_ALLOWED_OPERATORS.has(condition.operator)) {
                throw new Error("TextArea fields can only use character length or blank operators.");
            }
            if (conditionField && isPicklist && !PICKLIST_ALLOWED_OPERATORS.has(condition.operator)) {
                throw new Error("Picklist fields can only use equals, not equals, or blank operators.");
            }

            let compareValue = condition.compareValue ?? "";
            let compareFieldId = condition.compareFieldId ?? null;

            if (condition.compareSource === "value") {
                if (operatorRequiresValue(condition.operator) && !compareValue.trim()) {
                    throw new Error(`Provide a compare value for condition ${index + 1}`);
                }
                if (isPicklist && operatorRequiresValue(condition.operator)) {
                    const picklistId = Number(compareValue);
                    if (!Number.isFinite(picklistId)) {
                        throw new Error(`Select a valid picklist option for condition ${index + 1}`);
                    }
                    const match = (conditionField as any).picklistOptions?.find(
                        (opt: any) => opt.id === picklistId && opt.isActive !== false
                    );
                    if (!match) {
                        throw new Error(`Picklist option is not active for condition ${index + 1}`);
                    }
                }
                if (isCharacterLength) {
                    const parsed = Number(compareValue);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                        throw new Error(`Enter a valid character length for condition ${index + 1}`);
                    }
                }
                compareFieldId = null;
            } else if (condition.compareSource === "field") {
                if (isPicklist) {
                    throw new Error(`Picklist conditions must compare against a fixed value (condition ${index + 1}).`);
                }
                if (isCharacterLength) {
                    throw new Error(`Character length conditions must compare against a static value (condition ${index + 1}).`);
                }
                if (!compareFieldId) {
                    throw new Error(`Select a comparison field for condition ${index + 1}`);
                }
                if (!fieldMap.has(compareFieldId)) {
                    throw new Error(`Comparison field not found for condition ${index + 1}`);
                }
                const compareField = fieldMap.get(compareFieldId);
                if (compareField && UNSUPPORTED_VALIDATION_RULE_TYPES.has(compareField.type)) {
                    throw new Error("File fields cannot be used in validation conditions.");
                }
                if (compareField?.type === "TextArea") {
                    throw new Error("TextArea fields cannot be used for field-to-field comparisons.");
                }
                compareValue = "";
            }

            if (condition.fieldDefId && !fieldMap.has(condition.fieldDefId)) {
                throw new Error(`Field not found for condition ${index + 1}`);
            }

            if (["is_blank", "is_not_blank"].includes(condition.operator)) {
                if (condition.compareSource !== "value") {
                    condition.compareSource = "value";
                }
                if (compareValue !== "true" && compareValue !== "false") {
                    compareValue = "true";
                }
                compareFieldId = null;
            }

            return {
                fieldDefId: condition.fieldDefId ?? null,
                systemField: null,
                permissionSetId: null,
                operator: condition.operator,
                compareSource: condition.compareSource,
                compareValue,
                compareFieldId,
            };
        });

        const logicExpression =
            payload.logicOperator === "CUSTOM"
                ? normalizeCustomLogicExpressionOrThrow(payload.logicExpression, sanitizedConditions.length, "(1 OR 2) AND 3")
                : null;

        await db.$transaction(async (tx) => {
            await tx.validationRule.update({
                where: { id: ruleId },
                data: {
                    name: payload.name,
                    description: payload.description,
                    logicOperator: payload.logicOperator,
                    logicExpression,
                    errorMessage: payload.errorMessage,
                    errorFieldId: payload.errorFieldId ?? null,
                    errorPlacement: payload.errorPlacement,
                    isActive: payload.isActive,
                },
            });

            await tx.validationCondition.deleteMany({
                where: { ruleId },
            });

            await tx.validationCondition.createMany({
                data: sanitizedConditions.map((condition) => ({
                    ...condition,
                    ruleId,
                })),
            });
        });

        await syncValidationRuleDependencies(db, ruleId, organizationId);

        revalidatePath(`/admin/objects/${payload.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Update Validation Rule Error:", error);
        return { success: false, error: error.message || "Failed to update validation rule" };
    }
}

export async function deleteValidationRule(ruleId: number, objectDefId: number) {
    try {
        const { organizationId } = await getUserContext();

        const rule = await db.validationRule.findUnique({
            where: { id: ruleId },
            include: { objectDef: true },
        });

        if (!rule || rule.objectDefId !== objectDefId || rule.objectDef.organizationId !== organizationId) {
            return { success: false, error: "Validation rule not found." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.VALIDATION_RULE, ruleId);
            await tx.validationRule.delete({ where: { id: ruleId } });
        });
        revalidatePath(`/admin/objects/${objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Validation Rule Error:", error);
        return { success: false, error: error.message || "Failed to delete validation rule" };
    }
}
