"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";
import { getFieldDisplayValue } from "@/lib/field-data";
import {
    filterCandidateIdsByCustomLogicMatches,
} from "@/lib/validation/rule-logic";
import { Prisma, OwnerType } from "@prisma/client";
import { getDateOnlyRange, parseDateTimeValue } from "@/lib/temporal";

type SessionWithUser = {
    user: {
        id: string;
        organizationId: string;
    };
};

async function checkAuth(): Promise<SessionWithUser> {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized");
    }
    return session as unknown as SessionWithUser;
}

type WidgetFilter = {
    fieldDefId: number;
    operator: string;
    value?: string;
};

type FilterGroup = {
    logic?: "ALL" | "ANY" | "CUSTOM";
    expression?: string;
    filters?: WidgetFilter[];
};

const UNSUPPORTED_WIDGET_FILTER_TYPES = new Set(["TextArea", "File"]);

function normalizeFilterGroup(filters?: FilterGroup) {
    if (!filters) return { logic: "ALL" as const, expression: undefined, filters: [] as WidgetFilter[] };
    const logic = filters.logic === "CUSTOM" ? "CUSTOM" : filters.logic === "ANY" ? "ANY" : "ALL";
    const expression = typeof filters.expression === "string" ? filters.expression : undefined;
    const list = Array.isArray(filters.filters) ? filters.filters : [];
    return { logic, expression, filters: list };
}

function buildFilterCondition(filter: WidgetFilter, fieldDef: any) {
    const operator = filter.operator;
    const trimmedValue = (filter.value ?? "").toString().trim();

    if (operator === "is_blank") {
        return {
            fields: {
                none: {
                    fieldDefId: fieldDef.id,
                },
            },
        };
    }

    if (operator === "is_not_blank") {
        return {
            fields: {
                some: {
                    fieldDefId: fieldDef.id,
                },
            },
        };
    }

    if (!trimmedValue) return null;

    switch (fieldDef.type) {
        case "Number": {
            const num = Number(trimmedValue);
            if (!Number.isFinite(num)) return null;
            const valueNumber = new Prisma.Decimal(num);
            const compare: Record<string, any> = { equals: valueNumber, gt: valueNumber, gte: valueNumber, lt: valueNumber, lte: valueNumber };
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valueNumber: { not: valueNumber } } } },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valueNumber: compare[operator] ?? valueNumber,
                    },
                },
            };
        }
        case "Date": {
            const range = getDateOnlyRange(trimmedValue);
            if (!range) return null;
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        {
                            fields: {
                                some: {
                                    fieldDefId: fieldDef.id,
                                    OR: [
                                        { valueDate: { lt: range.start } },
                                        { valueDate: { gte: range.nextStart } },
                                    ],
                                },
                            },
                        },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valueDate: operator === "gt"
                            ? { gte: range.nextStart }
                            : operator === "gte"
                                ? { gte: range.start }
                                : operator === "lt"
                                    ? { lt: range.start }
                                    : operator === "lte"
                                        ? { lt: range.nextStart }
                                        : {
                                            gte: range.start,
                                            lt: range.nextStart,
                                        },
                    },
                },
            };
        }
        case "DateTime": {
            const date = parseDateTimeValue(trimmedValue);
            if (!date) return null;
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valueDate: { not: date } } } },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valueDate: operator === "gt"
                            ? { gt: date }
                            : operator === "gte"
                                ? { gte: date }
                                : operator === "lt"
                                    ? { lt: date }
                                    : operator === "lte"
                                        ? { lte: date }
                                        : date,
                    },
                },
            };
        }
        case "Checkbox": {
            const boolVal = trimmedValue === "true" || trimmedValue === "1";
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valueBoolean: { not: boolVal } } } },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valueBoolean: boolVal,
                    },
                },
            };
        }
        case "Picklist": {
            const optionId = Number(trimmedValue);
            if (!Number.isFinite(optionId)) return null;
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valuePicklistId: { not: optionId } } } },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valuePicklistId: optionId,
                    },
                },
            };
        }
        default: {
            const normalized = trimmedValue.toLowerCase();
            const valueSearch = operator === "contains" || operator === "not_contains"
                ? { contains: normalized }
                : normalized;
            if (operator === "not_equals") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valueSearch: { not: normalized } } } },
                    ],
                };
            }
            if (operator === "not_contains") {
                return {
                    OR: [
                        { fields: { none: { fieldDefId: fieldDef.id } } },
                        { fields: { some: { fieldDefId: fieldDef.id, valueSearch: { not: { contains: normalized } } } } },
                    ],
                };
            }
            return {
                fields: {
                    some: {
                        fieldDefId: fieldDef.id,
                        valueSearch,
                    },
                },
            };
        }
    }
}

function mergeWhere(base: any, condition: any) {
    return { AND: [base, condition] };
}

function applyOwnerScope(where: any, ownerScope: string | undefined, ownerQueueId: number | null | undefined, userId: number) {
    if (ownerScope === "mine") {
        return { ...where, ownerType: OwnerType.USER, ownerId: userId };
    }
    if (ownerScope === "queue" && ownerQueueId) {
        return { ...where, ownerType: OwnerType.QUEUE, ownerQueueId };
    }
    return where;
}

async function resolveCustomFilterIds(
    baseWhere: any,
    filters: WidgetFilter[],
    expression: string,
    fields: any[]
) {
    const baseRows = await db.record.findMany({
        where: baseWhere,
        select: { id: true },
    });
    const candidateIds = baseRows.map((row) => row.id);
    const filterSets: Array<Set<number>> = [];

    for (const filter of filters) {
        const fieldDef = fields.find((f: any) => f.id === filter.fieldDefId);
        if (!fieldDef || UNSUPPORTED_WIDGET_FILTER_TYPES.has(fieldDef.type)) {
            filterSets.push(new Set());
            continue;
        }
        const condition = buildFilterCondition(filter, fieldDef);
        if (!condition) {
            filterSets.push(new Set());
            continue;
        }
        const rows = await db.record.findMany({
            where: mergeWhere(baseWhere, condition),
            select: { id: true },
        });
        filterSets.push(new Set(rows.map((row) => row.id)));
    }

    return filterCandidateIdsByCustomLogicMatches(candidateIds, filterSets, expression);
}

function buildWhereFromFilters(baseWhere: any, filters: WidgetFilter[], fields: any[], logic: "ALL" | "ANY") {
    const conditions = filters
        .map((filter) => {
            const fieldDef = fields.find((f: any) => f.id === filter.fieldDefId);
            if (!fieldDef || UNSUPPORTED_WIDGET_FILTER_TYPES.has(fieldDef.type)) return null;
            return buildFilterCondition(filter, fieldDef);
        })
        .filter(Boolean) as any[];

    if (!conditions.length) return baseWhere;

    if (logic === "ANY") {
        return { AND: [baseWhere, { OR: conditions }] };
    }

    return { AND: [baseWhere, ...conditions] };
}

export async function getMetricData(objectDefId: number, config: any = {}) {
    if (!objectDefId) return 0;
    const session = await checkAuth();
    const organizationId = parseInt(session.user.organizationId);

    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId },
        include: { fields: true },
    });

    if (!objectDef) {
        throw new Error("Object not found");
    }

    const userId = parseInt(session.user.id);
    const orgId = parseInt(session.user.organizationId);
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    const canViewAll = await checkPermission(userId, orgId, objectDef.apiName, "viewAll");
    if (!canViewAll) {
        const canRead = await checkPermission(userId, orgId, objectDef.apiName, "read");
        if (!canRead) return 0;
    }

    let where: any = {
        objectDefId: objectDef.id,
        organizationId,
    };

    const accessFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);
    if (accessFilter) {
        where = { ...where, ...accessFilter };
    }
    where = applyOwnerScope(where, config.ownerScope, config.ownerQueueId, userId);

    const { logic, expression, filters } = normalizeFilterGroup(config.filtersGroup || {
        logic: config.filterLogic,
        expression: config.filterExpression,
        filters: config.filters,
    });

    if (filters.length > 0) {
        if (logic === "CUSTOM" && expression) {
            const ids = await resolveCustomFilterIds(where, filters, expression, objectDef.fields);
            where = { ...where, id: { in: ids } };
        } else {
            const effectiveLogic: "ALL" | "ANY" = logic === "ANY" ? "ANY" : "ALL";
            where = buildWhereFromFilters(where, filters, objectDef.fields, effectiveLogic);
        }
    }

    const aggregation = config.aggregation || "count";

    if (aggregation === "count") {
        return await db.record.count({ where });
    }

    const fieldDefId = config.valueFieldDefId;
    if (!fieldDefId) return 0;

    const valueField = objectDef.fields.find((f: any) => f.id === fieldDefId);
    if (!valueField || valueField.type !== "Number") return 0;

    const fieldData = await db.fieldData.findMany({
        where: {
            fieldDefId,
            record: where,
        },
        select: { valueNumber: true },
    });

    const values = fieldData
        .map((row) => (row.valueNumber !== null ? Number(row.valueNumber) : null))
        .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

    if (!values.length) return 0;

    if (aggregation === "sum") return values.reduce((a, b) => a + b, 0);
    if (aggregation === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
    if (aggregation === "min") return Math.min(...values);
    if (aggregation === "max") return Math.max(...values);
    return 0;
}

export async function getListWidgetData(objectDefId: number, config: any = {}) {
    if (!objectDefId) return { columns: [], rows: [], objectApiName: null };

    const session = await checkAuth();
    const organizationId = parseInt(session.user.organizationId);

    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId },
        include: {
            fields: {
                include: { picklistOptions: true },
            },
        },
    });

    if (!objectDef) {
        throw new Error("Object not found");
    }

    const userId = parseInt(session.user.id);
    const orgId = parseInt(session.user.organizationId);
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    const canViewAll = await checkPermission(userId, orgId, objectDef.apiName, "viewAll");
    if (!canViewAll) {
        const canRead = await checkPermission(userId, orgId, objectDef.apiName, "read");
        if (!canRead) return { columns: [], rows: [], objectApiName: objectDef.apiName };
    }

    let where: any = {
        objectDefId: objectDef.id,
        organizationId,
    };

    const accessFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);
    if (accessFilter) {
        where = { ...where, ...accessFilter };
    }
    where = applyOwnerScope(where, config.ownerScope, config.ownerQueueId, userId);

    const { logic, expression, filters } = normalizeFilterGroup(config.filtersGroup || {
        logic: config.filterLogic,
        expression: config.filterExpression,
        filters: config.filters,
    });

    if (filters.length > 0) {
        if (logic === "CUSTOM" && expression) {
            const ids = await resolveCustomFilterIds(where, filters, expression, objectDef.fields);
            where = { ...where, id: { in: ids } };
        } else {
            const effectiveLogic: "ALL" | "ANY" = logic === "ANY" ? "ANY" : "ALL";
            where = buildWhereFromFilters(where, filters, objectDef.fields, effectiveLogic);
        }
    }

    const limit = Number.isFinite(config.limit) ? Math.max(1, Math.min(50, config.limit)) : 5;
    const fieldDefIds: number[] = Array.isArray(config.fieldDefIds)
        ? config.fieldDefIds.filter((id: unknown): id is number => Number.isInteger(id))
        : [];
    const systemFields = Array.isArray(config.systemFields) ? config.systemFields : [];
    const sortFieldDefId = Number.isInteger(config.sortFieldDefId) ? config.sortFieldDefId : null;
    const sortSystemField = config.sortSystemField;
    const sortDirection = config.sortDirection === "asc" ? "asc" : "desc";

    const records = await db.record.findMany({
        where,
        orderBy: { createdAt: sortDirection },
        take: Math.min(500, limit * 5),
        include: {
            fields: {
                where: {
                    fieldDefId: {
                        in: Array.from(new Set<number>([...fieldDefIds, ...(sortFieldDefId ? [sortFieldDefId] : [])])),
                    },
                },
                include: { fieldDef: true, valuePicklist: true },
            },
        },
    });

    const fieldMap = new Map(objectDef.fields.map((f) => [f.id, f]));
    const picklistLabelMap = new Map<number, Map<number, string>>();
    objectDef.fields.forEach((field) => {
        if (field.type !== "Picklist") return;
        const map = new Map<number, string>();
        field.picklistOptions?.forEach((opt: any) => map.set(opt.id, opt.label));
        picklistLabelMap.set(field.id, map);
    });

    const lookupFieldIds = new Set<number>(
        fieldDefIds.filter((id: number) => {
            const field = fieldMap.get(id);
            return field?.type === "Lookup";
        })
    );
    const lookupFields = Array.from(lookupFieldIds)
        .map((id) => fieldMap.get(id))
        .filter(Boolean) as Array<{ id: number; lookupTargetId?: number | null }>;
    const lookupTargetIds = Array.from(
        new Set(
            lookupFields
                .map((field) => field.lookupTargetId)
                .filter((targetId): targetId is number => Number.isInteger(targetId))
        )
    );
    const lookupTargets = lookupTargetIds.length
        ? await db.objectDefinition.findMany({
            where: { organizationId, id: { in: lookupTargetIds } },
            select: { id: true, apiName: true },
        })
        : [];
    const lookupTargetApiNameById = new Map(lookupTargets.map((target) => [target.id, target.apiName]));

    const lookupIds = new Set<number>();
    if (lookupFieldIds.size > 0) {
        records.forEach((record) => {
            record.fields.forEach((fieldData: any) => {
                if (!lookupFieldIds.has(fieldData.fieldDefId)) return;
                const rawValue = fieldData.valueLookup ?? fieldData.valueText;
                const parsed = typeof rawValue === "number" ? rawValue : parseInt(String(rawValue ?? ""), 10);
                if (Number.isInteger(parsed) && parsed > 0) {
                    lookupIds.add(parsed);
                }
            });
        });
    }

    const lookupRecords = lookupIds.size
        ? await db.record.findMany({
            where: {
                organizationId,
                id: { in: Array.from(lookupIds) },
            },
            select: {
                id: true,
                name: true,
                objectDefId: true,
            },
        })
        : [];
    const lookupRecordMap = new Map(
        lookupRecords.map((record) => [record.id, { name: record.name || `Record #${record.id}`, objectDefId: record.objectDefId }])
    );

    const formatValue = (fieldDefId: number, fieldData: any) => {
        const fieldDef = fieldMap.get(fieldDefId);
        if (!fieldDef || !fieldData) return "";
        if (fieldDef.type === "Picklist") {
            const map = picklistLabelMap.get(fieldDefId);
            const label = fieldData.valuePicklistId ? map?.get(fieldData.valuePicklistId) : "";
            return label || "";
        }
        const display = getFieldDisplayValue(fieldData);
        return display ?? "";
    };

    const getCellValue = (fieldDefId: number, fieldData: any) => {
        const fieldDef = fieldMap.get(fieldDefId);
        if (!fieldDef || !fieldData) return "";
        if (fieldDef.type !== "Lookup") {
            return formatValue(fieldDefId, fieldData);
        }

        const rawLookupId = fieldData.valueLookup ?? fieldData.valueText;
        const lookupId = typeof rawLookupId === "number" ? rawLookupId : parseInt(String(rawLookupId ?? ""), 10);
        if (!Number.isInteger(lookupId) || lookupId <= 0) return "";

        const resolved = lookupRecordMap.get(lookupId);
        const targetObjectApiName =
            (resolved?.objectDefId ? lookupTargetApiNameById.get(resolved.objectDefId) : undefined) ||
            (fieldDef.lookupTargetId ? lookupTargetApiNameById.get(fieldDef.lookupTargetId) : undefined) ||
            null;

        return {
            type: "lookup",
            id: lookupId,
            name: resolved?.name || `Record #${lookupId}`,
            targetObjectApiName,
        } as const;
    };

    const sortedRecords = sortSystemField
        ? [...records].sort((a, b) => {
            const aValue = sortSystemField === "updatedAt" ? a.updatedAt : a.createdAt;
            const bValue = sortSystemField === "updatedAt" ? b.updatedAt : b.createdAt;
            if (aValue === bValue) return 0;
            if (sortDirection === "asc") return aValue > bValue ? 1 : -1;
            return aValue < bValue ? 1 : -1;
        })
        : sortFieldDefId
            ? [...records].sort((a, b) => {
                const aField = a.fields.find((f: any) => f.fieldDefId === sortFieldDefId);
                const bField = b.fields.find((f: any) => f.fieldDefId === sortFieldDefId);
                const aValue = aField ? formatValue(sortFieldDefId, aField) : "";
                const bValue = bField ? formatValue(sortFieldDefId, bField) : "";
                if (aValue === bValue) return 0;
                if (sortDirection === "asc") return aValue > bValue ? 1 : -1;
                return aValue < bValue ? 1 : -1;
            })
            : records;

    const rows = sortedRecords.slice(0, limit).map((record) => {
        const values: Record<string, any> = {};
        fieldDefIds.forEach((id: number) => {
            const fieldData = record.fields.find((f: any) => f.fieldDefId === id);
            values[String(id)] = fieldData ? getCellValue(id, fieldData) : "";
        });
        systemFields.forEach((field: "createdAt" | "updatedAt") => {
            if (field === "createdAt") {
                values.createdAt = record.createdAt.toLocaleDateString();
            }
            if (field === "updatedAt") {
                values.updatedAt = record.updatedAt.toLocaleDateString();
            }
        });
        return {
            id: record.id,
            name: record.name || `Record #${record.id}`,
            createdAt: record.createdAt,
            values,
        };
    });

    const columns = [
        ...fieldDefIds
            .map((id: number) => fieldMap.get(id))
            .filter(Boolean)
            .map((field: any) => ({ key: String(field.id), label: field.label })),
        ...systemFields.map((field: "createdAt" | "updatedAt") => ({
            key: field,
            label: field === "updatedAt" ? "Last Modified Date" : "Created Date",
        })),
    ];

    return { columns, rows, objectApiName: objectDef.apiName };
}

export async function getChartData(objectDefId: number, config: any = {}) {
    if (!objectDefId) return [];

    const session = await checkAuth();
    const organizationId = parseInt(session.user.organizationId);

    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId },
        include: { fields: { include: { picklistOptions: true } } },
    });

    if (!objectDef) throw new Error("Object not found");

    const userId = parseInt(session.user.id);
    const orgId = parseInt(session.user.organizationId);
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    const canViewAll = await checkPermission(userId, orgId, objectDef.apiName, "viewAll");
    if (!canViewAll) {
        const canRead = await checkPermission(userId, orgId, objectDef.apiName, "read");
        if (!canRead) return [];
    }

    let where: any = {
        objectDefId: objectDef.id,
        organizationId,
    };

    const accessFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);
    if (accessFilter) {
        where = { ...where, ...accessFilter };
    }
    where = applyOwnerScope(where, config.ownerScope, config.ownerQueueId, userId);

    const { logic, expression, filters } = normalizeFilterGroup(config.filtersGroup || {
        logic: config.filterLogic,
        expression: config.filterExpression,
        filters: config.filters,
    });

    if (filters.length > 0) {
        if (logic === "CUSTOM" && expression) {
            const ids = await resolveCustomFilterIds(where, filters, expression, objectDef.fields);
            where = { ...where, id: { in: ids } };
        } else {
            const effectiveLogic: "ALL" | "ANY" = logic === "ANY" ? "ANY" : "ALL";
            where = buildWhereFromFilters(where, filters, objectDef.fields, effectiveLogic);
        }
    }

    const groupByFieldDefId = config.groupByFieldDefId;
    if (!groupByFieldDefId) return [];

    const groupField = objectDef.fields.find((f) => f.id === groupByFieldDefId);
    if (!groupField || groupField.type !== "Picklist") return [];

    const picklistLabels = new Map<number, string>();
    groupField.picklistOptions?.forEach((opt: any) => picklistLabels.set(opt.id, opt.label));

    const valueFieldDefId = config.valueFieldDefId;
    const needsSum = config.aggregation === "sum";

    const records = await db.record.findMany({
        where,
        include: {
            fields: {
                where: {
                    fieldDefId: {
                        in: needsSum && valueFieldDefId
                            ? [groupByFieldDefId, valueFieldDefId]
                            : [groupByFieldDefId],
                    },
                },
                select: {
                    fieldDefId: true,
                    valuePicklistId: true,
                    valueNumber: true,
                },
            },
        },
    });

    const buckets: Record<string, number> = {};

    for (const record of records) {
        const groupFieldData = record.fields.find((f) => f.fieldDefId === groupByFieldDefId);
        const groupValue = groupFieldData?.valuePicklistId ? picklistLabels.get(groupFieldData.valuePicklistId) : "Unassigned";
        if (!groupValue) continue;

        if (!buckets[groupValue]) buckets[groupValue] = 0;

        if (needsSum && valueFieldDefId) {
            const valueField = record.fields.find((f) => f.fieldDefId === valueFieldDefId);
            const number = valueField?.valueNumber ? Number(valueField.valueNumber) : 0;
            buckets[groupValue] += Number.isFinite(number) ? number : 0;
        } else {
            buckets[groupValue] += 1;
        }
    }

    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}
