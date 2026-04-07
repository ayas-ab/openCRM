"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    removeDependenciesForSource,
    syncListViewDependencies,
} from "@/lib/metadata-dependencies";
import { checkPermission } from "@/lib/permissions";
import { normalizeCustomLogicExpressionOrThrow } from "@/lib/validation/rule-logic";
import { ListViewPrincipalType, MetadataDependencySourceType } from "@prisma/client";
import { z } from "zod";

async function getUserContext() {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");
    const user = session.user as any;
    return {
        userId: parseInt(user.id),
        organizationId: parseInt(user.organizationId),
        userType: user.userType,
    };
}

const listViewFilterSchema = z
    .object({
        fieldDefId: z.number().optional(),
        field: z.string().optional(),
        operator: z.string().optional(),
        value: z.string().optional(),
    })
    .refine((data) => data.fieldDefId || data.field, {
        message: "Each filter needs a field.",
    });

const listViewCriteriaSchema = z.object({
    logic: z.enum(["ALL", "ANY", "CUSTOM"]).default("ALL"),
    expression: z.string().optional(),
    filters: z.array(listViewFilterSchema).default([]),
    ownerScope: z.enum(["any", "mine", "queue"]).optional(),
    ownerQueueId: z.number().int().positive().nullable().optional(),
});

const listViewColumnSchema = z.object({
    fieldDefId: z.number(),
    width: z.string().optional(),
});

const listViewPayloadSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    isGlobal: z.boolean().default(false),
    shareGroupIds: z.array(z.number()).default([]),
    sharePermissionSetIds: z.array(z.number()).default([]),
    criteria: listViewCriteriaSchema.optional(),
    columns: z.array(listViewColumnSchema).min(1, "Pick at least one column"),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    viewMode: z.enum(["table", "kanban"]).default("table"),
    kanbanGroupByFieldDefId: z.number().optional().nullable(),
});

const updateListViewSchema = listViewPayloadSchema.extend({
    listViewId: z.number(),
});

const UNSUPPORTED_LIST_VIEW_TYPES = new Set(["TextArea", "File"]);
const BUILT_IN_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name"]);
const PICKLIST_ALLOWED_OPERATORS = new Set(["equals", "not_equals", "is_blank", "is_not_blank"]);

function normalizeCriteria(criteria: z.infer<typeof listViewCriteriaSchema> | undefined) {
    if (!criteria) {
        return {
            logic: "ALL" as const,
            filters: [] as z.infer<typeof listViewFilterSchema>[],
            ownerScope: "any" as const,
            ownerQueueId: null as number | null,
        };
    }
    const logic =
        criteria.logic === "CUSTOM"
            ? "CUSTOM"
            : criteria.logic === "ANY"
                ? "ANY"
                : "ALL";
    const filters = Array.isArray(criteria.filters) ? criteria.filters : [];
    const ownerScope = criteria.ownerScope === "mine" || criteria.ownerScope === "queue" ? criteria.ownerScope : "any";
    const ownerQueueId = ownerScope === "queue" ? criteria.ownerQueueId ?? null : null;
    if (logic === "CUSTOM") {
        return {
            logic,
            expression: normalizeCustomLogicExpressionOrThrow(criteria.expression, filters.length),
            filters,
            ownerScope,
            ownerQueueId,
        };
    }
    return { logic, filters, ownerScope, ownerQueueId };
}

async function validateOwnerScope(
    organizationId: number,
    criteria: z.infer<typeof listViewCriteriaSchema> | undefined
) {
    const ownerScope = criteria?.ownerScope === "mine" || criteria?.ownerScope === "queue" ? criteria.ownerScope : "any";
    if (ownerScope !== "queue") {
        return;
    }
    const ownerQueueId = criteria?.ownerQueueId ?? null;
    if (!ownerQueueId) {
        throw new Error("Select a queue for the Record Owner filter.");
    }
    const queue = await db.queue.findFirst({
        where: { id: ownerQueueId, organizationId },
        select: { id: true },
    });
    if (!queue) {
        throw new Error("Record Owner queue must be a valid queue.");
    }
}

async function requireListViewPermission(objectDefId: number) {
    const { userId, organizationId } = await getUserContext();
    const objectDef = await db.objectDefinition.findUnique({
        where: { id: objectDefId, organizationId },
        select: { id: true, apiName: true },
    });

    if (!objectDef) return { error: "Object not found." } as const;

    const canModify = await checkPermission(userId, organizationId, objectDef.apiName, "modifyListViews");
    if (!canModify) return { error: "Insufficient permissions." } as const;

    return { userId, organizationId, objectDef } as const;
}

function sanitizeShareIds(ids: number[]) {
    return Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
}

export async function createListView(data: z.infer<typeof listViewPayloadSchema>) {
    try {
        const payload = listViewPayloadSchema.parse(data);
        const permission = await requireListViewPermission(payload.objectDefId);
        if ("error" in permission) return { success: false, error: permission.error };

        const { organizationId } = permission;
        const objectDefFields = await db.fieldDefinition.findMany({
            where: { objectDefId: payload.objectDefId },
            select: {
                id: true,
                apiName: true,
                type: true,
                picklistOptions: {
                    select: { id: true, isActive: true },
                },
            },
        });
        const fieldById = new Map(objectDefFields.map((field) => [field.id, field]));
        const fieldByApi = new Map(objectDefFields.map((field) => [field.apiName, field]));
        const validFieldIds = new Set(
            objectDefFields.filter((field) => !UNSUPPORTED_LIST_VIEW_TYPES.has(field.type)).map((field) => field.id)
        );
        const columns = payload.columns.filter((column) => validFieldIds.has(column.fieldDefId));

        if (columns.length === 0) {
            return { success: false, error: "Pick at least one valid column." };
        }

        const filterFields = payload.criteria?.filters ?? [];
        for (const filter of filterFields) {
            const fieldDef =
                filter.fieldDefId !== undefined
                    ? fieldById.get(filter.fieldDefId)
                    : filter.field
                        ? fieldByApi.get(filter.field)
                        : null;
            if (fieldDef && UNSUPPORTED_LIST_VIEW_TYPES.has(fieldDef.type)) {
                return { success: false, error: "TextArea and File fields cannot be used in list view filters." };
            }
            if (fieldDef?.type === "Picklist") {
                const operator = filter.operator || "equals";
                if (!PICKLIST_ALLOWED_OPERATORS.has(operator)) {
                    return { success: false, error: "Picklist filters can only use equals, not equals, or blank operators." };
                }
                if (operator !== "is_blank" && operator !== "is_not_blank") {
                    const picklistId = Number(filter.value);
                    const match = fieldDef.picklistOptions?.find((opt) => opt.id === picklistId && opt.isActive);
                    if (!match) {
                        return { success: false, error: "Picklist filters must use an active option." };
                    }
                }
            }
        }

        if (payload.sortField && !BUILT_IN_SORT_FIELDS.has(payload.sortField)) {
            const sortFieldDef = fieldByApi.get(payload.sortField);
            if (!sortFieldDef || UNSUPPORTED_LIST_VIEW_TYPES.has(sortFieldDef.type)) {
                return { success: false, error: "TextArea and File fields cannot be used for list view sorting." };
            }
        }

        if (payload.viewMode === "kanban") {
            const groupById = payload.kanbanGroupByFieldDefId ?? null;
            const groupByField = groupById ? fieldById.get(groupById) : null;
            if (!groupByField) {
                return { success: false, error: "Select a picklist field to group the Kanban view." };
            }
            if (groupByField.type !== "Picklist") {
                return { success: false, error: "Kanban can only group by a picklist field." };
            }
        }

        const shareGroupIds = payload.isGlobal ? [] : sanitizeShareIds(payload.shareGroupIds);
        const sharePermissionSetIds = payload.isGlobal ? [] : sanitizeShareIds(payload.sharePermissionSetIds);

        const groups = shareGroupIds.length
            ? await db.group.findMany({
                where: { organizationId, id: { in: shareGroupIds } },
                select: { id: true },
            })
            : [];
        const permissionSets = sharePermissionSetIds.length
            ? await db.permissionSet.findMany({
                where: { organizationId, id: { in: sharePermissionSetIds } },
                select: { id: true },
            })
            : [];

        const shareRecords = [
            ...groups.map((group) => ({
                principalType: ListViewPrincipalType.GROUP,
                principalId: group.id,
            })),
            ...permissionSets.map((set) => ({
                principalType: ListViewPrincipalType.PERMISSION_SET,
                principalId: set.id,
            })),
        ];

        if (!payload.isGlobal && shareRecords.length === 0) {
            return { success: false, error: "Choose who can see this list view." };
        }

        await validateOwnerScope(organizationId, payload.criteria);
        const normalizedCriteria = normalizeCriteria(payload.criteria);

        const created = await db.listView.create({
            data: {
                organizationId,
                objectDefId: payload.objectDefId,
                name: payload.name.trim(),
                description: payload.description?.trim() || null,
                criteria: normalizedCriteria,
                sortField: payload.sortField?.trim() || null,
                sortDirection: payload.sortDirection,
                isGlobal: payload.isGlobal,
                viewMode: payload.viewMode,
                kanbanGroupByFieldDefId:
                    payload.viewMode === "kanban" ? payload.kanbanGroupByFieldDefId ?? null : null,
                columns: {
                    create: columns.map((column, index) => ({
                        fieldDefId: column.fieldDefId,
                        sortOrder: index,
                        width: column.width ?? null,
                    })),
                },
                shares: {
                    create: shareRecords.map((share) => ({
                        ...share,
                        organizationId,
                    })),
                },
            },
        });

        await syncListViewDependencies(db, created.id, organizationId);

        return { success: true, data: { id: created.id } };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A list view with this name already exists." };
        }
        return { success: false, error: error.message || "Failed to create list view." };
    }
}

export async function updateListView(data: z.infer<typeof updateListViewSchema>) {
    try {
        const payload = updateListViewSchema.parse(data);
        const permission = await requireListViewPermission(payload.objectDefId);
        if ("error" in permission) return { success: false, error: permission.error };

        const { organizationId } = permission;
        const listView = await db.listView.findFirst({
            where: { id: payload.listViewId, organizationId, objectDefId: payload.objectDefId },
        });

        if (!listView) return { success: false, error: "List view not found." };

        const objectDefFields = await db.fieldDefinition.findMany({
            where: { objectDefId: payload.objectDefId },
            select: {
                id: true,
                apiName: true,
                type: true,
                picklistOptions: {
                    select: { id: true, isActive: true },
                },
            },
        });
        const fieldById = new Map(objectDefFields.map((field) => [field.id, field]));
        const fieldByApi = new Map(objectDefFields.map((field) => [field.apiName, field]));
        const validFieldIds = new Set(
            objectDefFields.filter((field) => !UNSUPPORTED_LIST_VIEW_TYPES.has(field.type)).map((field) => field.id)
        );
        const columns = payload.columns.filter((column) => validFieldIds.has(column.fieldDefId));

        if (columns.length === 0) {
            return { success: false, error: "Pick at least one valid column." };
        }

        const filterFields = payload.criteria?.filters ?? [];
        for (const filter of filterFields) {
            const fieldDef =
                filter.fieldDefId !== undefined
                    ? fieldById.get(filter.fieldDefId)
                    : filter.field
                        ? fieldByApi.get(filter.field)
                        : null;
            if (fieldDef && UNSUPPORTED_LIST_VIEW_TYPES.has(fieldDef.type)) {
                return { success: false, error: "TextArea and File fields cannot be used in list view filters." };
            }
            if (fieldDef?.type === "Picklist") {
                const operator = filter.operator || "equals";
                if (!PICKLIST_ALLOWED_OPERATORS.has(operator)) {
                    return { success: false, error: "Picklist filters can only use equals, not equals, or blank operators." };
                }
                if (operator !== "is_blank" && operator !== "is_not_blank") {
                    const picklistId = Number(filter.value);
                    const match = fieldDef.picklistOptions?.find((opt) => opt.id === picklistId && opt.isActive);
                    if (!match) {
                        return { success: false, error: "Picklist filters must use an active option." };
                    }
                }
            }
        }

        if (payload.sortField && !BUILT_IN_SORT_FIELDS.has(payload.sortField)) {
            const sortFieldDef = fieldByApi.get(payload.sortField);
            if (!sortFieldDef || UNSUPPORTED_LIST_VIEW_TYPES.has(sortFieldDef.type)) {
                return { success: false, error: "TextArea and File fields cannot be used for list view sorting." };
            }
        }

        if (payload.viewMode === "kanban") {
            const groupById = payload.kanbanGroupByFieldDefId ?? null;
            const groupByField = groupById ? fieldById.get(groupById) : null;
            if (!groupByField) {
                return { success: false, error: "Select a picklist field to group the Kanban view." };
            }
            if (groupByField.type !== "Picklist") {
                return { success: false, error: "Kanban can only group by a picklist field." };
            }
        }

        const shareGroupIds = payload.isGlobal ? [] : sanitizeShareIds(payload.shareGroupIds);
        const sharePermissionSetIds = payload.isGlobal ? [] : sanitizeShareIds(payload.sharePermissionSetIds);

        const groups = shareGroupIds.length
            ? await db.group.findMany({
                where: { organizationId, id: { in: shareGroupIds } },
                select: { id: true },
            })
            : [];
        const permissionSets = sharePermissionSetIds.length
            ? await db.permissionSet.findMany({
                where: { organizationId, id: { in: sharePermissionSetIds } },
                select: { id: true },
            })
            : [];

        const shareRecords = [
            ...groups.map((group) => ({
                principalType: ListViewPrincipalType.GROUP,
                principalId: group.id,
            })),
            ...permissionSets.map((set) => ({
                principalType: ListViewPrincipalType.PERMISSION_SET,
                principalId: set.id,
            })),
        ];

        if (!payload.isGlobal && shareRecords.length === 0) {
            return { success: false, error: "Choose who can see this list view." };
        }

        await validateOwnerScope(organizationId, payload.criteria);
        const normalizedCriteria = normalizeCriteria(payload.criteria);

        await db.$transaction(async (tx) => {
            await tx.listView.update({
                where: { id: listView.id },
                data: {
                    name: payload.name.trim(),
                    description: payload.description?.trim() || null,
                    criteria: normalizedCriteria,
                    sortField: payload.sortField?.trim() || null,
                    sortDirection: payload.sortDirection,
                    isGlobal: payload.isGlobal,
                    viewMode: payload.viewMode,
                    kanbanGroupByFieldDefId:
                        payload.viewMode === "kanban" ? payload.kanbanGroupByFieldDefId ?? null : null,
                },
            });

            await tx.listViewColumn.deleteMany({
                where: { listViewId: listView.id },
            });

            await tx.listViewShare.deleteMany({
                where: { listViewId: listView.id },
            });

            if (columns.length) {
                await tx.listViewColumn.createMany({
                    data: columns.map((column, index) => ({
                        listViewId: listView.id,
                        fieldDefId: column.fieldDefId,
                        sortOrder: index,
                        width: column.width ?? null,
                    })),
                });
            }

            if (shareRecords.length) {
                await tx.listViewShare.createMany({
                    data: shareRecords.map((share) => ({
                        listViewId: listView.id,
                        organizationId,
                        ...share,
                    })),
                });
            }
        });

        await syncListViewDependencies(db, listView.id, organizationId);

        return { success: true, data: { id: listView.id } };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A list view with this name already exists." };
        }
        return { success: false, error: error.message || "Failed to update list view." };
    }
}

export async function deleteListView(listViewId: number, objectDefId: number) {
    try {
        const permission = await requireListViewPermission(objectDefId);
        if ("error" in permission) return { success: false, error: permission.error };

        const { organizationId } = permission;
        const listView = await db.listView.findFirst({
            where: { id: listViewId, organizationId, objectDefId },
            select: { id: true, isDefault: true },
        });

        if (!listView) return { success: false, error: "List view not found." };
        if (listView.isDefault) {
            return { success: false, error: "Default list views cannot be deleted." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.LIST_VIEW, listViewId);
            await tx.listView.delete({
                where: { id: listViewId },
            });
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to delete list view." };
    }
}

export async function setUserDefaultListView(listViewId: number | null, objectDefId: number) {
    try {
        const { userId, organizationId } = await getUserContext();

        if (listViewId !== null) {
            const listView = await db.listView.findFirst({
                where: { id: listViewId, organizationId, objectDefId },
                select: { id: true },
            });
            if (!listView) return { success: false, error: "List view not found." };
        }

        await db.userListViewPreference.upsert({
            where: {
                userId_objectDefId: {
                    userId,
                    objectDefId,
                },
            },
            create: {
                userId,
                organizationId,
                objectDefId,
                defaultListViewId: listViewId,
            },
            update: {
                defaultListViewId: listViewId,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to update default list view." };
    }
}

export async function toggleListViewPin(listViewId: number, objectDefId: number) {
    try {
        const { userId, organizationId } = await getUserContext();

        const listView = await db.listView.findFirst({
            where: { id: listViewId, organizationId, objectDefId },
            select: { id: true },
        });

        if (!listView) return { success: false, error: "List view not found." };

        const existing = await db.listViewPin.findUnique({
            where: {
                userId_listViewId: {
                    userId,
                    listViewId,
                },
            },
        });

        if (existing) {
            await db.listViewPin.delete({
                where: {
                    userId_listViewId: {
                        userId,
                        listViewId,
                    },
                },
            });
        } else {
            await db.listViewPin.create({
                data: {
                    organizationId,
                    userId,
                    listViewId,
                },
            });
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to update pin." };
    }
}
