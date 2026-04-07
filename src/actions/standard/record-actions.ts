"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { validateRecordData } from "@/lib/validation/record-validation";
import { normalizeUniqueValue, normalizeStoredUniqueValue } from "@/lib/unique";
import { RecordWithData } from "@/types/record";
import { revalidatePath } from "next/cache";
import {
    AssignmentTargetType,
    NotificationType,
    OwnerType,
    PrincipalType,
    Prisma,
    ShareAccessLevel,
    type ValidationCondition,
    type ValidationRule,
} from "@prisma/client";
import { checkPermission, getUserPermissionSetIds } from "@/lib/permissions";
import { buildRecordAccessFilter, buildRecordAccessSql, getUserQueueIds } from "@/lib/record-access";
import {
    buildFieldDataPayload,
    deriveRecordName,
    getFieldDisplayValue,
    getLookupId,
    getPrimaryNameField,
} from "@/lib/field-data";
import {
    LIST_VIEW_SEARCH_TYPES,
    UNSUPPORTED_LIST_VIEW_TYPES,
    buildListViewExpressionFilter,
    buildListViewExpressionSql,
    buildListViewFieldFilter,
    parseListViewExpression,
    tokenizeListViewExpression,
    validateListViewExpression,
    type ListViewExpressionNode,
} from "@/lib/list-view-expression";
import { nextAutoNumberValue } from "@/lib/auto-number";
import { getAccessibleListViewById } from "@/lib/list-views";
import {
    characterLengthOperators,
    coerceFieldValue,
    evaluateCustomLogicExpression,
    evaluateOperator,
    getComparableFieldValue,
    normalizeCriteria,
    type RuleCriteria,
    type RuleCriteriaFilter,
} from "@/lib/validation/rule-logic";
import { deleteFolderSafe, resolveStoragePath } from "@/lib/file-storage";
import { findDuplicateMatches } from "@/lib/duplicates/duplicate-rules";
import { USER_ID_FIELD_API_NAME, USER_OBJECT_API_NAME } from "@/lib/user-companion";
import {
    getDateOnlyRange,
    getTemporalComparableValue,
    parseDateTimeValue,
} from "@/lib/temporal";

// Helper to get current user and their organization
async function getUserContext() {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized");
    }
    const user = session.user as any;

    if (!user.id || !user.organizationId) {
        console.error("User context missing required fields:", user);
        throw new Error("Invalid session: Missing user ID or Organization ID. Please sign out and sign in again.");
    }

    const userId = parseInt(user.id);
    const organizationId = parseInt(user.organizationId);

    if (isNaN(userId) || isNaN(organizationId)) {
        console.error("User context has invalid IDs:", user);
        throw new Error("Invalid session: IDs are not numbers. Please sign out and sign in again.");
    }

    return { userId, organizationId, userType: user.userType };
}

const BUILT_IN_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name"]);
type ListViewOwnerScope = "any" | "mine" | "queue";

function buildFieldSortExpression(fieldType: string) {
    switch (fieldType) {
        case "Number":
        case "Currency":
            return Prisma.sql`COALESCE(fd."valueNumber", 0)`;
        case "Date":
        case "DateTime":
            return Prisma.sql`COALESCE(fd."valueDate", '1970-01-01')`;
        case "Checkbox":
            return Prisma.sql`COALESCE(fd."valueBoolean", 0)`;
        default:
            return Prisma.sql`COALESCE(fd."valueSearch", '')`;
    }
}

function resolveListViewOwnerScope(criteria: unknown): { ownerScope: ListViewOwnerScope; ownerQueueId: number | null } {
    if (!criteria || typeof criteria !== "object") {
        return { ownerScope: "any", ownerQueueId: null };
    }

    const rawScope = (criteria as { ownerScope?: unknown }).ownerScope;
    const ownerScope: ListViewOwnerScope =
        rawScope === "mine" || rawScope === "queue"
            ? rawScope
            : "any";
    if (ownerScope !== "queue") {
        return { ownerScope, ownerQueueId: null };
    }

    const rawQueueId = (criteria as { ownerQueueId?: unknown }).ownerQueueId;
    const parsedQueueId =
        typeof rawQueueId === "number"
            ? rawQueueId
            : typeof rawQueueId === "string"
                ? parseInt(rawQueueId, 10)
                : NaN;
    if (!Number.isInteger(parsedQueueId) || parsedQueueId <= 0) {
        return { ownerScope: "any", ownerQueueId: null };
    }

    return { ownerScope: "queue", ownerQueueId: parsedQueueId };
}

function applyListViewOwnerScopeFilter(
    where: Prisma.RecordWhereInput,
    ownerScope: ListViewOwnerScope,
    ownerQueueId: number | null,
    userId: number
) {
    if (ownerScope === "mine") {
        return { ...where, ownerType: OwnerType.USER, ownerId: userId } satisfies Prisma.RecordWhereInput;
    }
    if (ownerScope === "queue" && ownerQueueId) {
        return { ...where, ownerType: OwnerType.QUEUE, ownerQueueId } satisfies Prisma.RecordWhereInput;
    }
    return where;
}

function buildListViewOwnerScopeSql(ownerScope: ListViewOwnerScope, ownerQueueId: number | null, userId: number) {
    if (ownerScope === "mine") {
        return Prisma.sql`AND r."ownerType" = ${OwnerType.USER} AND r."ownerId" = ${userId}`;
    }
    if (ownerScope === "queue" && ownerQueueId) {
        return Prisma.sql`AND r."ownerType" = ${OwnerType.QUEUE} AND r."ownerQueueId" = ${ownerQueueId}`;
    }
    return Prisma.sql``;
}

type FieldValueContainer = {
    valueText?: string | null;
    valueNumber?: Prisma.Decimal | null;
    valueDate?: Date | null;
    valueBoolean?: boolean | null;
    valueLookup?: number | null;
    valuePicklistId?: number | null;
    valuePicklist?: { id: number; label: string; isActive?: boolean } | null;
};

function hasFieldValueChanged(fieldType: string, existing: FieldValueContainer | null, next: FieldValueContainer) {
    const oldValue = getComparableFieldValue(fieldType, existing);
    const newValue = getComparableFieldValue(fieldType, next);
    return oldValue !== newValue;
}

type ValidationConditionWithFields = ValidationCondition & {
    fieldDef?: { apiName: string; type: string } | null;
    compareField?: { apiName: string; type: string } | null;
};

type ValidationRuleWithRelations = ValidationRule & {
    conditions: ValidationConditionWithFields[];
    errorFieldId?: number | null;
    errorField?: { apiName: string } | null;
};

const numericOperators = new Set(["gt", "gte", "lt", "lte"]);
const stringOnlyOperators = new Set(["contains", "not_contains"]);
const textFieldTypes = new Set(["Text", "Email", "Phone", "Url", "TextArea", "AutoNumber"]);

function buildValueMap(
    fields: any[],
    inputData: Record<string, any>,
    existingFieldData?: any[],
    baseRecord?: { id?: number; ownerId?: number | null; createdAt?: Date; updatedAt?: Date; name?: string }
) {
    const map: Record<string, any> = {};

    if (baseRecord) {
        if (baseRecord.id !== undefined) map.id = baseRecord.id;
        if (baseRecord.ownerId !== undefined) map.ownerId = baseRecord.ownerId;
        if (baseRecord.name !== undefined) map.name = baseRecord.name;
        if (baseRecord.createdAt instanceof Date) map.createdAt = baseRecord.createdAt.toISOString();
        if (baseRecord.updatedAt instanceof Date) map.updatedAt = baseRecord.updatedAt.toISOString();
    }

    if (existingFieldData) {
        existingFieldData.forEach((fieldData: any) => {
            const fieldType = fieldData.fieldDef?.type;
            if (fieldType === "Picklist") {
                map[fieldData.fieldDef.apiName] = fieldData.valuePicklistId ?? null;
                return;
            }
            map[fieldData.fieldDef.apiName] = getFieldDisplayValue(fieldData);
        });
    }

    fields.forEach((field: any) => {
        if (inputData[field.apiName] !== undefined) {
            if (field.type === "Picklist") {
                const picklistId = Number(inputData[field.apiName]);
                map[field.apiName] = Number.isFinite(picklistId) ? picklistId : null;
                return;
            }
            map[field.apiName] = inputData[field.apiName];
        }
    });

    return map;
}

function extractFieldInputData(fields: any[], valueMap: Record<string, any>) {
    const result: Record<string, any> = {};
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(valueMap, field.apiName)) {
            result[field.apiName] = valueMap[field.apiName];
        }
    }
    return result;
}

function extractUpdateValidationFieldData(
    fields: any[],
    inputData: Record<string, any>,
    finalValueMap: Record<string, any>,
    existingFieldData?: any[]
) {
    const validationFieldNames = new Set<string>();

    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(inputData, field.apiName)) {
            validationFieldNames.add(field.apiName);
        }
    }

    const changedPayloads = buildChangedFieldPayloads(fields, finalValueMap, existingFieldData);
    for (const field of fields) {
        if (changedPayloads.has(field.id)) {
            validationFieldNames.add(field.apiName);
        }
    }

    const result: Record<string, any> = {};
    for (const field of fields) {
        if (
            validationFieldNames.has(field.apiName) &&
            Object.prototype.hasOwnProperty.call(finalValueMap, field.apiName)
        ) {
            result[field.apiName] = finalValueMap[field.apiName];
        }
    }

    return result;
}

function buildChangedFieldPayloads(
    fields: any[],
    valueMap: Record<string, any>,
    existingFieldData?: any[]
) {
    const payloads = new Map<number, ReturnType<typeof buildFieldDataPayload>>();

    for (const field of fields) {
        if (field.type === "File" || field.type === "AutoNumber") continue;
        if (!Object.prototype.hasOwnProperty.call(valueMap, field.apiName)) continue;

        const payload = buildFieldDataPayload(field, valueMap[field.apiName]);
        const existingSnapshot = existingFieldData?.find((fd: any) => fd.fieldDefId === field.id) as FieldValueContainer | undefined;

        if (!hasFieldValueChanged(field.type, existingSnapshot ?? null, payload)) {
            continue;
        }

        payloads.set(field.id, payload);
    }

    return payloads;
}

function parseDuplicateConfirmRuleIds(rawValue: unknown) {
    const values = Array.isArray(rawValue) ? rawValue : typeof rawValue === "string" ? rawValue.split(",") : [];
    return values
        .map((value) => (typeof value === "number" ? value : parseInt(String(value), 10)))
        .filter((value) => Number.isInteger(value) && value > 0);
}

async function validateLookupValues(
    fields: any[],
    inputData: Record<string, any>,
    organizationId: number
) {
    const errors: Record<string, string> = {};
    const lookupFields = fields.filter((field: any) => field.type === "Lookup" && field.lookupTargetId);
    const lookupsToCheck: Array<{ field: any; ids: number[] }> = [];

    for (const field of lookupFields) {
        if (!Object.prototype.hasOwnProperty.call(inputData, field.apiName)) continue;
        const rawValue = inputData[field.apiName];
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;

        const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
        const parsedIds: number[] = [];
        let hasInvalid = false;

        for (const value of rawValues) {
            const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
            if (Number.isNaN(parsed)) {
                hasInvalid = true;
                continue;
            }
            parsedIds.push(parsed);
        }

        if (hasInvalid || parsedIds.length === 0) {
            errors[field.apiName] = `${field.label} has an invalid lookup value.`;
            continue;
        }

        lookupsToCheck.push({ field, ids: parsedIds });
    }

    if (lookupsToCheck.length === 0) {
        if (Object.keys(errors).length > 0) {
            throw new Error(JSON.stringify(errors));
        }
        return;
    }

    const idsByTarget = new Map<number, Set<number>>();
    lookupsToCheck.forEach(({ field, ids }) => {
        const targetId = field.lookupTargetId as number;
        const bucket = idsByTarget.get(targetId) ?? new Set<number>();
        ids.forEach((id) => bucket.add(id));
        idsByTarget.set(targetId, bucket);
    });

    const validIdsByTarget = new Map<number, Set<number>>();
    for (const [targetId, ids] of idsByTarget.entries()) {
        const matches = await db.record.findMany({
            where: {
                organizationId,
                objectDefId: targetId,
                id: { in: Array.from(ids) },
            },
            select: { id: true },
        });
        validIdsByTarget.set(targetId, new Set(matches.map((row) => row.id)));
    }

    for (const { field, ids } of lookupsToCheck) {
        const validIds = validIdsByTarget.get(field.lookupTargetId as number) ?? new Set<number>();
        const invalid = ids.some((id) => !validIds.has(id));
        if (invalid) {
            errors[field.apiName] = `${field.label} has an invalid lookup value.`;
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new Error(JSON.stringify(errors));
    }
}


function buildListViewSystemFilter(field: string, operator: string, value?: string) {
    const trimmed = value?.trim();

    if (field === "name") {
        if (operator === "is_blank") return { name: null } satisfies Prisma.RecordWhereInput;
        if (operator === "is_not_blank") {
            return { name: { not: null } } satisfies Prisma.RecordWhereInput;
        }
        if (!trimmed) return null;
        const predicate =
            operator === "contains" || operator === "not_contains"
                ? { contains: trimmed, mode: "insensitive" as const }
                : { equals: trimmed, mode: "insensitive" as const };
        const base = { name: predicate } satisfies Prisma.RecordWhereInput;
        return operator === "not_equals" || operator === "not_contains" ? { NOT: base } : base;
    }

    if (field === "createdAt" || field === "updatedAt") {
        const date = trimmed ? new Date(trimmed) : null;
        if (!date || Number.isNaN(date.getTime())) return null;
        const comparator =
            operator === "gt"
                ? { gt: date }
                : operator === "gte"
                    ? { gte: date }
                    : operator === "lt"
                        ? { lt: date }
                        : operator === "lte"
                            ? { lte: date }
                            : date;
        const base = { [field]: comparator } satisfies Prisma.RecordWhereInput;
        return operator === "not_equals" ? { NOT: base } : base;
    }

    if (field === "ownerId" || field === "ownerQueueId") {
        if (operator === "is_blank") {
            return { [field]: null } satisfies Prisma.RecordWhereInput;
        }
        if (operator === "is_not_blank") {
            return { [field]: { not: null } } satisfies Prisma.RecordWhereInput;
        }
        if (!trimmed) return null;
        const parsed = parseInt(trimmed, 10);
        if (Number.isNaN(parsed)) return null;
        const base = { [field]: parsed } satisfies Prisma.RecordWhereInput;
        return operator === "not_equals" ? { NOT: base } : base;
    }

    return null;
}

function buildListViewCriteriaFilter(
    objectDef: { fields: any[] },
    criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined
) {
    const { logic, filters, expression } = normalizeCriteria(criteria);
    if (!filters.length) return null;

    const fieldById = new Map(objectDef.fields.map((field: any) => [field.id, field]));
    const fieldByApi = new Map(objectDef.fields.map((field: any) => [field.apiName, field]));
    const conditions = filters.map((filter) => {
        const operator = filter.operator || "equals";
        if (filter.field) {
            return buildListViewSystemFilter(filter.field, operator, filter.value);
        }
        const fieldDef = filter.fieldDefId
            ? fieldById.get(filter.fieldDefId)
            : filter.field
                ? fieldByApi.get(filter.field)
                : null;
        if (!fieldDef) return null;
        return buildListViewFieldFilter(fieldDef, operator, filter.value);
    });

    if (logic === "CUSTOM" && expression) {
        const tokens = tokenizeListViewExpression(expression);
        if (!tokens) return null;
        let ast: ListViewExpressionNode;
        try {
            ast = parseListViewExpression(tokens);
        } catch (error) {
            console.warn("List view custom logic error:", error);
            return null;
        }
        if (!validateListViewExpression(ast, conditions.length)) return null;
        return buildListViewExpressionFilter(ast, conditions);
    }

    const pruned = conditions.filter(Boolean) as Prisma.RecordWhereInput[];
    if (!pruned.length) return null;
    return logic === "ANY" ? { OR: pruned } : { AND: pruned };
}

function buildListViewSqlFieldClause(fieldDef: { id: number; type: string }, operator: string, value?: string) {
    const fieldDefId = fieldDef.id;
    const trimmed = value?.trim() ?? "";
    const valueSearch = trimmed.toLowerCase();
    if (UNSUPPORTED_LIST_VIEW_TYPES.has(fieldDef.type)) {
        return null;
    }
    const valueColumn =
        fieldDef.type === "Number" || fieldDef.type === "Currency"
            ? "valueNumber"
            : fieldDef.type === "Date" || fieldDef.type === "DateTime"
                ? "valueDate"
                : fieldDef.type === "Checkbox"
                    ? "valueBoolean"
                    : fieldDef.type === "Lookup"
                        ? "valueLookup"
                        : fieldDef.type === "Picklist"
                            ? "valuePicklistId"
                            : "valueText";

    if (operator === "is_blank") {
        return Prisma.sql`NOT EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd.${Prisma.raw(`"${valueColumn}"`)} IS NOT NULL
        )`;
    }

    if (operator === "is_not_blank") {
        return Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd.${Prisma.raw(`"${valueColumn}"`)} IS NOT NULL
        )`;
    }

    if (operator === "contains" || operator === "not_contains") {
        if (!trimmed) return null;
        if (fieldDef.type === "Picklist") return null;
        const usesSearch = LIST_VIEW_SEARCH_TYPES.has(fieldDef.type);
        const clause = usesSearch
            ? Prisma.sql`EXISTS (
                SELECT 1 FROM "FieldData" fd
                WHERE fd."recordId" = r."id"
                  AND fd."fieldDefId" = ${fieldDefId}
                  AND fd."valueSearch" LIKE ${`%${valueSearch}%`}
            )`
            : Prisma.sql`EXISTS (
                SELECT 1 FROM "FieldData" fd
                WHERE fd."recordId" = r."id"
                  AND fd."fieldDefId" = ${fieldDefId}
                  AND fd."valueText" ILIKE ${`%${trimmed}%`}
            )`;
        return operator === "not_contains" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (!trimmed) return null;

    if (fieldDef.type === "Number" || fieldDef.type === "Currency") {
        const numeric = Number(trimmed);
        if (Number.isNaN(numeric)) return null;
        const predicate =
            operator === "gt"
                ? Prisma.sql`fd."valueNumber" > ${numeric}`
                : operator === "gte"
                    ? Prisma.sql`fd."valueNumber" >= ${numeric}`
                    : operator === "lt"
                        ? Prisma.sql`fd."valueNumber" < ${numeric}`
                        : operator === "lte"
                            ? Prisma.sql`fd."valueNumber" <= ${numeric}`
                            : Prisma.sql`fd."valueNumber" = ${numeric}`;
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND ${predicate}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (fieldDef.type === "Picklist") {
        const picklistId = parseInt(trimmed, 10);
        if (Number.isNaN(picklistId)) return null;
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd."valuePicklistId" = ${picklistId}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (fieldDef.type === "Date") {
        const range = getDateOnlyRange(trimmed);
        if (!range) return null;
        const predicate =
            operator === "gt"
                ? Prisma.sql`fd."valueDate" >= ${range.nextStart}`
                : operator === "gte"
                    ? Prisma.sql`fd."valueDate" >= ${range.start}`
                    : operator === "lt"
                        ? Prisma.sql`fd."valueDate" < ${range.start}`
                        : operator === "lte"
                            ? Prisma.sql`fd."valueDate" < ${range.nextStart}`
                            : Prisma.sql`fd."valueDate" >= ${range.start} AND fd."valueDate" < ${range.nextStart}`;
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND ${predicate}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (fieldDef.type === "DateTime") {
        const date = parseDateTimeValue(trimmed);
        if (!date) return null;
        const predicate =
            operator === "gt"
                ? Prisma.sql`fd."valueDate" > ${date}`
                : operator === "gte"
                    ? Prisma.sql`fd."valueDate" >= ${date}`
                    : operator === "lt"
                        ? Prisma.sql`fd."valueDate" < ${date}`
                        : operator === "lte"
                            ? Prisma.sql`fd."valueDate" <= ${date}`
                            : Prisma.sql`fd."valueDate" = ${date}`;
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND ${predicate}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (fieldDef.type === "Checkbox") {
        const boolValue = trimmed === "true" || trimmed === "1";
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd."valueBoolean" = ${boolValue}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (fieldDef.type === "Lookup") {
        const lookupId = parseInt(trimmed, 10);
        if (Number.isNaN(lookupId)) return null;
        const clause = Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd."valueLookup" = ${lookupId}
        )`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    const clause = LIST_VIEW_SEARCH_TYPES.has(fieldDef.type)
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd."valueSearch" = ${valueSearch}
        )`
        : Prisma.sql`EXISTS (
            SELECT 1 FROM "FieldData" fd
            WHERE fd."recordId" = r."id"
              AND fd."fieldDefId" = ${fieldDefId}
              AND fd."valueText" = ${trimmed}
        )`;
    return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
}

function buildListViewSqlSystemClause(field: string, operator: string, value?: string) {
    const trimmed = value?.trim() ?? "";

    if (field === "name") {
        if (operator === "is_blank") {
            return Prisma.sql`r."name" IS NULL`;
        }
        if (operator === "is_not_blank") {
            return Prisma.sql`r."name" IS NOT NULL`;
        }
        if (!trimmed) return null;
        if (operator === "contains" || operator === "not_contains") {
            const clause = Prisma.sql`r."name" ILIKE ${`%${trimmed}%`}`;
            return operator === "not_contains" ? Prisma.sql`NOT (${clause})` : clause;
        }
        const clause = Prisma.sql`r."name" ILIKE ${trimmed}`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    if (field === "createdAt" || field === "updatedAt") {
        if (!trimmed) return null;
        const date = new Date(trimmed);
        if (Number.isNaN(date.getTime())) return null;
        const columnSql = field === "createdAt" ? Prisma.sql`r."createdAt"` : Prisma.sql`r."updatedAt"`;
        const predicate =
            operator === "gt"
                ? Prisma.sql`${columnSql} > ${date}`
                : operator === "gte"
                    ? Prisma.sql`${columnSql} >= ${date}`
                    : operator === "lt"
                        ? Prisma.sql`${columnSql} < ${date}`
                        : operator === "lte"
                            ? Prisma.sql`${columnSql} <= ${date}`
                            : Prisma.sql`${columnSql} = ${date}`;
        return operator === "not_equals" ? Prisma.sql`NOT (${predicate})` : predicate;
    }

    if (field === "ownerId" || field === "ownerQueueId") {
        if (operator === "is_blank") {
            return field === "ownerId"
                ? Prisma.sql`r."ownerId" IS NULL`
                : Prisma.sql`r."ownerQueueId" IS NULL`;
        }
        if (operator === "is_not_blank") {
            return field === "ownerId"
                ? Prisma.sql`r."ownerId" IS NOT NULL`
                : Prisma.sql`r."ownerQueueId" IS NOT NULL`;
        }
        if (!trimmed) return null;
        const parsed = parseInt(trimmed, 10);
        if (Number.isNaN(parsed)) return null;
        const clause =
            field === "ownerId"
                ? Prisma.sql`r."ownerId" = ${parsed}`
                : Prisma.sql`r."ownerQueueId" = ${parsed}`;
        return operator === "not_equals" ? Prisma.sql`NOT (${clause})` : clause;
    }

    return null;
}

function buildListViewCriteriaSql(
    objectDef: { fields: any[] },
    criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined
) {
    const { logic, filters, expression } = normalizeCriteria(criteria);
    if (!filters.length) return null;

    const fieldById = new Map(objectDef.fields.map((field: any) => [field.id, field]));
    const fieldByApi = new Map(objectDef.fields.map((field: any) => [field.apiName, field]));

    const clauses = filters.map((filter) => {
        const operator = filter.operator || "equals";
        if (filter.field) {
            return buildListViewSqlSystemClause(filter.field, operator, filter.value);
        }
        const fieldDef = filter.fieldDefId
            ? fieldById.get(filter.fieldDefId)
            : filter.field
                ? fieldByApi.get(filter.field)
                : null;
        if (!fieldDef) return null;
        return buildListViewSqlFieldClause(fieldDef, operator, filter.value);
    });

    if (logic === "CUSTOM" && expression) {
        const tokens = tokenizeListViewExpression(expression);
        if (!tokens) return null;
        let ast: ListViewExpressionNode;
        try {
            ast = parseListViewExpression(tokens);
        } catch (error) {
            console.warn("List view custom SQL logic error:", error);
            return null;
        }
        if (!validateListViewExpression(ast, clauses.length)) return null;
        return buildListViewExpressionSql(ast, clauses);
    }

    const filtered = clauses.filter(Boolean) as Prisma.Sql[];
    if (!filtered.length) return null;

    const joiner = logic === "ANY" ? " OR " : " AND ";
    return Prisma.sql`(${Prisma.join(filtered, joiner)})`;
}

function evaluateCriteria(
    criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined,
    fields: any[],
    valueMap: Record<string, any>
) {
    const { logic, filters, expression } = normalizeCriteria(criteria);
    if (!filters.length) return true;

    const fieldById = new Map(fields.map((field: any) => [field.id, field]));
    const fieldByApi = new Map(fields.map((field: any) => [field.apiName, field]));

    const matches = filters.map((filter) => {
        if (filter.field === "ownerGroupId") {
            const operator = filter.operator || "equals";
            const leftValue = valueMap.ownerGroupId ?? null;
            if (operator === "is_blank" || operator === "is_not_blank") {
                return evaluateOperator(leftValue, null, operator);
            }
            if (leftValue === null) return false;
            const parsed = parseInt(filter.value ?? "", 10);
            const rightValue = Number.isNaN(parsed) ? filter.value : parsed;
            return evaluateOperator(leftValue, rightValue, operator);
        }

        const fieldDef = filter.fieldDefId
            ? fieldById.get(filter.fieldDefId)
            : filter.field
                ? fieldByApi.get(filter.field)
                : null;

        if (!fieldDef) return false;

        const operator = filter.operator || "equals";
        const leftValue = coerceFieldValue(fieldDef.type, valueMap[fieldDef.apiName]);

        if (leftValue === null && operator !== "is_blank" && operator !== "is_not_blank") {
            return false;
        }

        if (operator === "is_blank" || operator === "is_not_blank") {
            return evaluateOperator(leftValue, null, operator);
        }

        const rightValue = coerceFieldValue(fieldDef.type, filter.value ?? "");
        return evaluateOperator(leftValue, rightValue, operator);
    });

    let result = logic === "ANY" ? matches.some(Boolean) : matches.every(Boolean);

    if (logic === "CUSTOM" && expression) {
        const customResult = evaluateCustomLogicExpression(expression, matches);
        if (customResult !== null) {
            result = customResult;
        }
    }

    return result;
}

function evaluateCondition(
    condition: ValidationConditionWithFields,
    valueMap: Record<string, any>,
    permissionSetIds: number[]
) {
    if (condition.systemField === "currentUserPermissionSetId") {
        if (!condition.permissionSetId) return false;
        const hasPermission = permissionSetIds.includes(condition.permissionSetId);
        if (condition.operator === "not_has_permission") {
            return !hasPermission;
        }
        return hasPermission;
    }

    if (!condition.fieldDef) return false;

    const fieldType = condition.fieldDef.type;
    const isCharacterLength = characterLengthOperators.has(condition.operator);
    const isBlankOperator = ["is_blank", "is_not_blank"].includes(condition.operator);

    if (numericOperators.has(condition.operator) && !["Number", "Currency", "Date", "DateTime"].includes(fieldType)) {
        return false;
    }
    if (stringOnlyOperators.has(condition.operator) && fieldType === "Checkbox") {
        return false;
    }
    if (isCharacterLength && !textFieldTypes.has(fieldType)) {
        return false;
    }
    if (fieldType === "TextArea" && !isCharacterLength && !isBlankOperator) {
        return false;
    }

    const leftValue = coerceFieldValue(condition.fieldDef.type, valueMap[condition.fieldDef.apiName]);

    if (leftValue === null && !isBlankOperator && !isCharacterLength) {
        return false;
    }

    let rightValue: any = null;

    if (condition.compareSource === "field") {
        if (isCharacterLength) return false;
        if (!condition.compareField) return false;
        if (condition.compareField.type === "TextArea") return false;
        rightValue = coerceFieldValue(condition.compareField.type, valueMap[condition.compareField.apiName]);
    } else {
        rightValue = isCharacterLength
            ? condition.compareValue
            : coerceFieldValue(condition.fieldDef.type, condition.compareValue);
    }

    return evaluateOperator(leftValue, rightValue, condition.operator);
}

function enforceValidationRules(
    rules: ValidationRuleWithRelations[] | undefined,
    valueMap: Record<string, any>,
    permissionSetIds: number[]
) {
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
        if (!rule.conditions || rule.conditions.length === 0) continue;

        const conditionMatches = rule.conditions.map((condition) =>
            evaluateCondition(condition, valueMap, permissionSetIds)
        );
        let shouldTrigger = false;

        if (rule.logicOperator === "CUSTOM" && (rule as any).logicExpression) {
            const customResult = evaluateCustomLogicExpression((rule as any).logicExpression, conditionMatches);
            if (customResult === null) {
                console.warn("Validation custom logic error: expression could not be evaluated.");
                shouldTrigger = false;
            } else {
                shouldTrigger = customResult;
            }
        } else {
            shouldTrigger =
                rule.logicOperator === "ANY"
                    ? conditionMatches.some(Boolean)
                    : conditionMatches.every(Boolean);
        }

        if (shouldTrigger) {
            const err: any = new Error(rule.errorMessage);
            err.errorPlacement = rule.errorPlacement || "toast";
            err.errorFieldId = (rule as any).errorFieldId ?? null;
            throw err;
        }
    }
}

async function resolveAssignmentRule(
    organizationId: number,
    objectDefId: number,
    fields: any[],
    valueMap: Record<string, any>
) {
    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId },
        select: { apiName: true },
    });
    if (objectDef?.apiName === USER_OBJECT_API_NAME) {
        return null;
    }

    const rules = await db.assignmentRule.findMany({
        where: {
            organizationId,
            objectDefId,
            isActive: true,
        },
        orderBy: { sortOrder: "asc" },
    });

    for (const rule of rules) {
        if (!evaluateCriteria(rule.criteria as RuleCriteria, fields, valueMap)) continue;

        if (rule.targetType === AssignmentTargetType.USER && rule.targetUserId) {
            return {
                targetType: AssignmentTargetType.USER,
                ownerId: rule.targetUserId,
                ownerQueueId: null,
            };
        }

        if (rule.targetType === AssignmentTargetType.QUEUE && rule.targetQueueId) {
            return {
                targetType: AssignmentTargetType.QUEUE,
                ownerId: null,
                ownerQueueId: rule.targetQueueId,
            };
        }
    }

    return null;
}

async function applySharingRules(
    tx: Prisma.TransactionClient,
    organizationId: number,
    objectDefId: number,
    recordId: number,
    fields: any[],
    valueMap: Record<string, any>
) {
    const rules = await tx.sharingRule.findMany({
        where: {
            organizationId,
            objectDefId,
            isActive: true,
        },
        orderBy: { sortOrder: "asc" },
    });

    if (rules.length === 0) {
        await tx.recordShare.deleteMany({
            where: {
                recordId,
                organizationId,
                principalType: PrincipalType.GROUP,
            },
        });
        return;
    }

    const accessRank: Record<ShareAccessLevel, number> = {
        [ShareAccessLevel.READ]: 1,
        [ShareAccessLevel.EDIT]: 2,
        [ShareAccessLevel.DELETE]: 3,
    };

    const targetAccess = new Map<number, ShareAccessLevel>();
    for (const rule of rules) {
        if (!evaluateCriteria(rule.criteria as RuleCriteria, fields, valueMap)) continue;

        const current = targetAccess.get(rule.targetGroupId);
        if (!current || accessRank[rule.accessLevel] > accessRank[current]) {
            targetAccess.set(rule.targetGroupId, rule.accessLevel);
        }
    }

    const groupIds = Array.from(targetAccess.keys());

    if (groupIds.length === 0) {
        await tx.recordShare.deleteMany({
            where: {
                recordId,
                organizationId,
                principalType: PrincipalType.GROUP,
            },
        });
        return;
    }

    await tx.recordShare.deleteMany({
        where: {
            recordId,
            organizationId,
            principalType: PrincipalType.GROUP,
            principalId: { notIn: groupIds },
        },
    });

    for (const [groupId, accessLevel] of targetAccess.entries()) {
        await tx.recordShare.upsert({
            where: {
                recordId_principalType_principalId: {
                    recordId,
                    principalType: PrincipalType.GROUP,
                    principalId: groupId,
                },
            },
            create: {
                recordId,
                organizationId,
                principalType: PrincipalType.GROUP,
                principalId: groupId,
                accessLevel,
            },
            update: {
                accessLevel,
            },
        });
    }
}

async function createAssignmentNotifications(
    tx: Prisma.TransactionClient,
    params: {
        organizationId: number;
        recordId: number;
        ownerType: OwnerType;
        ownerId: number | null;
        ownerQueueId: number | null;
        objectLabel: string;
        recordName: string | null;
        notifyOnAssignment: boolean;
    }
) {
    const { organizationId, recordId, ownerType, ownerId, ownerQueueId, objectLabel, recordName, notifyOnAssignment } = params;

    if (ownerType === OwnerType.QUEUE && ownerQueueId) {
        const members = await tx.queueMember.findMany({
            where: { queueId: ownerQueueId },
            select: { userId: true },
        });

        if (members.length === 0) return;

        const message = `New ${objectLabel} assigned to your queue.`;

        await tx.notification.createMany({
            data: members.map((member) => ({
                organizationId,
                userId: member.userId,
                recordId,
                type: NotificationType.QUEUE_ASSIGNMENT,
                message,
            })),
        });
    }

    if (ownerType === OwnerType.USER && notifyOnAssignment && ownerId) {
        const label = recordName ? `${objectLabel}: ${recordName}` : objectLabel;
        await tx.notification.create({
            data: {
                organizationId,
                userId: ownerId,
                recordId,
                type: NotificationType.USER_ASSIGNMENT,
                message: `You were assigned ${label}.`,
            },
        });
    }
}

export async function getRecords(
    objectApiName: string,
    page: number = 1,
    pageSize: number = 25,
    sortField?: string,
    sortDirection: "asc" | "desc" = "desc",
    listViewId?: number
) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    const currentPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const currentPageSize = Number.isFinite(pageSize) ? Math.min(Math.max(1, Math.floor(pageSize)), 100) : 25;
    const normalizedSortDirection: "asc" | "desc" = sortDirection === "asc" ? "asc" : "desc";
    const normalizedSortField = sortField?.trim() || undefined;
    const hasExplicitSort = Boolean(normalizedSortField);

    // Permission Check & Determine Scope
    const canViewAll = await checkPermission(userId, organizationId, objectApiName, "viewAll");

    if (!canViewAll) {
        const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
        if (!canRead) throw new Error("Insufficient permissions");
    }

    // 1. Get Object Definition
    const objectDef = await db.objectDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: objectApiName,
            },
        },
        include: {
            fields: {
                include: {
                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                },
            },
            validationRules: {
                where: { isActive: true },
                include: {
                    conditions: {
                        orderBy: { createdAt: "asc" },
                        include: {
                            fieldDef: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                            compareField: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                        },
                    },
                    errorField: true,
                },
            },
        },
    });

    if (!objectDef) {
        throw new Error(`Object ${objectApiName} not found`);
    }

    const activeListView = listViewId
        ? await getAccessibleListViewById(userId, organizationId, objectDef.id, listViewId)
        : null;

    const listViewCriteriaFilter = activeListView
        ? buildListViewCriteriaFilter(objectDef, activeListView.criteria as RuleCriteria | RuleCriteriaFilter[])
        : null;
    const listViewCriteriaSql = activeListView
        ? buildListViewCriteriaSql(objectDef, activeListView.criteria as RuleCriteria | RuleCriteriaFilter[])
        : null;
    const { ownerScope: listViewOwnerScope, ownerQueueId: listViewOwnerQueueId } = resolveListViewOwnerScope(
        activeListView?.criteria
    );

    const accessFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);
    let where: Prisma.RecordWhereInput = {
        organizationId,
        objectDefId: objectDef.id,
        ...(accessFilter ?? {}),
    };
    where = applyListViewOwnerScopeFilter(where, listViewOwnerScope, listViewOwnerQueueId, userId);
    if (listViewCriteriaFilter) {
        where = { ...where, ...listViewCriteriaFilter };
    }

    const total = await db.record.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / currentPageSize));
    const skip = (currentPage - 1) * currentPageSize;

    const listViewSortField = activeListView?.sortField?.trim() || undefined;
    const listViewSortDirection = activeListView?.sortDirection === "asc" ? "asc" : "desc";
    const effectiveSortField = hasExplicitSort ? normalizedSortField : listViewSortField || "createdAt";
    const effectiveSortDirection = hasExplicitSort
        ? normalizedSortDirection
        : activeListView
            ? listViewSortDirection
            : normalizedSortDirection;

    const sortFieldDef =
        effectiveSortField && !BUILT_IN_SORT_FIELDS.has(effectiveSortField)
            ? objectDef.fields.find((field) => field.apiName === effectiveSortField)
            : null;

    const resolvedSortFieldDef =
        sortFieldDef && !UNSUPPORTED_LIST_VIEW_TYPES.has(sortFieldDef.type) ? sortFieldDef : null;

    const resolvedSortField = resolvedSortFieldDef
        ? resolvedSortFieldDef.apiName
        : effectiveSortField && BUILT_IN_SORT_FIELDS.has(effectiveSortField)
            ? effectiveSortField
            : "createdAt";

    const include = {
        fields: {
            include: {
                fieldDef: {
                    include: {
                        picklistOptions: { orderBy: { sortOrder: Prisma.SortOrder.asc } },
                    },
                },
                valuePicklist: true,
            },
        },
    };

    let records: any[] = [];

    if (resolvedSortFieldDef) {
        try {
            const accessFilterSql = canViewAll
                ? Prisma.sql``
                : buildRecordAccessSql(userId, organizationId, queueIds, userGroupId);
            const listViewOwnerScopeSql = buildListViewOwnerScopeSql(
                listViewOwnerScope,
                listViewOwnerQueueId,
                userId
            );
            const listViewFilterSql = listViewCriteriaSql
                ? Prisma.sql`AND ${listViewCriteriaSql}`
                : Prisma.sql``;
            const directionSql = effectiveSortDirection === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
            const orderExpression = buildFieldSortExpression(resolvedSortFieldDef.type);

            const orderedRows = await db.$queryRaw<{ id: number }[]>(Prisma.sql`
                SELECT r."id"
                FROM "Record" r
                LEFT JOIN "FieldData" fd
                    ON fd."recordId" = r."id"
                    AND fd."fieldDefId" = ${resolvedSortFieldDef.id}
                WHERE r."organizationId" = ${organizationId}
                  AND r."objectDefId" = ${objectDef.id}
                  ${accessFilterSql}
                  ${listViewOwnerScopeSql}
                  ${listViewFilterSql}
                ORDER BY ${orderExpression} ${directionSql}, r."createdAt" ${directionSql}
                LIMIT ${currentPageSize}
                OFFSET ${skip}
            `);

            const orderedIds = orderedRows.map((row) => row.id);
            if (orderedIds.length > 0) {
                const fetched = await db.record.findMany({
                    where: {
                        ...where,
                        id: { in: orderedIds },
                    },
                    include,
                });
                const recordMap = new Map(fetched.map((record) => [record.id, record]));
                records = orderedIds
                    .map((id) => recordMap.get(id))
                    .filter((record): record is typeof fetched[number] => Boolean(record));
            }
        } catch (error) {
            console.warn("Custom field sort failed, falling back to in-memory sort.", error);

            const fallbackRecords = await db.record.findMany({
                where,
                include,
            });

            const getSortValue = (record: any) => {
                const fieldData = record.fields.find((field: any) => field.fieldDefId === resolvedSortFieldDef.id);
                if (!fieldData) {
                    switch (resolvedSortFieldDef.type) {
                        case "Number":
                        case "Currency":
                            return 0;
                        case "Date":
                        case "DateTime":
                            return 0;
                        case "Checkbox":
                            return 0;
                        default:
                            return "";
                    }
                }

                switch (resolvedSortFieldDef.type) {
                    case "Number":
                    case "Currency":
                        return fieldData.valueNumber ? Number(fieldData.valueNumber) : 0;
                    case "Date":
                    case "DateTime":
                        return fieldData.valueDate
                            ? getTemporalComparableValue(resolvedSortFieldDef.type, fieldData.valueDate) ?? 0
                            : 0;
                    case "Checkbox":
                        return fieldData.valueBoolean ? 1 : 0;
                    case "Lookup":
                        return fieldData.valueSearch ?? "";
                    default:
                        return fieldData.valueSearch ?? fieldData.valueText ?? "";
                }
            };

            const sorted = fallbackRecords.sort((left, right) => {
                const leftValue = getSortValue(left);
                const rightValue = getSortValue(right);
                if (leftValue === rightValue) return 0;
                if (leftValue > rightValue) return 1;
                return -1;
            });

            const ordered = effectiveSortDirection === "desc" ? sorted.reverse() : sorted;
            records = ordered.slice(skip, skip + currentPageSize);
        }
    } else {
        const orderBy =
            resolvedSortField === "name"
                ? { name: effectiveSortDirection }
                : resolvedSortField === "updatedAt"
                    ? { updatedAt: effectiveSortDirection }
                    : { createdAt: effectiveSortDirection };

        records = await db.record.findMany({
            where,
            include,
            skip,
            take: currentPageSize,
            orderBy,
        });
    }

    // 3. Transform Data
    const transformedRecords: RecordWithData[] = records.map((record: any) => {
        const data: any = {
            id: record.id,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        ownerId: record.ownerId,
        ownerQueueId: record.ownerQueueId,
        ownerType: record.ownerType,
            organizationId: record.organizationId,
            objectDefId: record.objectDefId,
            createdById: record.createdById,
            name: record.name ?? undefined,
        };

        record.fields.forEach((fieldData: any) => {
            data[fieldData.fieldDef.apiName] = getFieldDisplayValue(fieldData);
        });

        return data as RecordWithData;
    });

    // 4. Resolve Lookups
    const lookupResolutions: Record<string, Record<string, { id: number; name: string; targetObjectApiName: string }>> = {};

    const lookupFields = objectDef.fields.filter((f: any) => f.type === "Lookup" && f.lookupTargetId);

    for (const field of lookupFields) {
        // Get target object definition to know the API name
        const targetObjectDef = await db.objectDefinition.findFirst({
            where: { id: field.lookupTargetId!, organizationId },
            include: {
                fields: {
                    include: {
                        picklistOptions: { orderBy: { sortOrder: "asc" } },
                    },
                },
            },
        });

        if (!targetObjectDef) continue;

        // Collect all IDs for this field
        const targetIds = transformedRecords
            .map(r => r[field.apiName])
            .filter(id => id) // Filter out null/undefined/empty
            .map(id => parseInt(String(id)))
            .filter(id => !isNaN(id));

        const uniqueTargetIds = [...new Set(targetIds)];

        if (uniqueTargetIds.length === 0) continue;

        // Fetch target records
        const targetRecords = await db.record.findMany({
            where: {
                id: { in: uniqueTargetIds },
                organizationId,
                objectDefId: targetObjectDef.id,
            },
            include: {
                fields: {
                    where: {
                        fieldDef: {
                            OR: [
                                { apiName: "name" },
                                { type: "Text" }
                            ]
                        }
                    },
                    include: {
                        fieldDef: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                        },
                        valuePicklist: true,
                    }
                }
            }
        });

        // Map IDs to Names
        lookupResolutions[field.apiName] = {};

        targetRecords.forEach(rec => {
            const fallbackField = rec.fields.find(f => f.fieldDef.apiName === "name") || rec.fields[0];
            const fallbackName = fallbackField ? fallbackField.valueText : null;
            const name = rec.name || fallbackName || `Record #${rec.id}`;

            lookupResolutions[field.apiName][String(rec.id)] = {
                id: rec.id,
                name,
                targetObjectApiName: targetObjectDef.apiName
            };
        });
    }

    return {
        data: transformedRecords,
        meta: {
            page: currentPage,
            pageSize: currentPageSize,
            total,
            totalPages,
            sortField: resolvedSortField,
            sortDirection: effectiveSortDirection,
            objectDef,
            listView: activeListView,
            lookupResolutions,
        },
    };
}

export async function getRecord(objectApiName: string, recordId: number) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    // Permission Check
    const canViewAll = await checkPermission(userId, organizationId, objectApiName, "viewAll");

    if (!canViewAll) {
        const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
        if (!canRead) return { success: false, error: "INSUFFICIENT_PERMISSIONS" };
    }

    const accessFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);

    const record = await db.record.findFirst({
        where: {
            id: recordId,
            organizationId, // Ensure tenant isolation
            ...(accessFilter ?? {}),
        },
        include: {
            objectDef: {
                include: {
                    fields: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: Prisma.SortOrder.asc } },
                        },
                    },
                },
            },
            fields: {
                include: {
                    fieldDef: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: Prisma.SortOrder.asc } },
                        },
                    },
                    valuePicklist: true,
                },
            },
            owner: {
                select: {
                    name: true,
                    email: true,
                    companionRecord: {
                        select: { id: true },
                    },
                },
            },
            ownerQueue: {
                select: {
                    name: true,
                },
            },
            createdBy: {
                select: {
                    name: true,
                },
            },
            lastModifiedBy: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!record) {
        if (!canViewAll) {
            const existing = await db.record.findUnique({
                where: { id: recordId, organizationId },
            });
            if (existing) {
                return { success: false, error: "ACCESS_DENIED" };
            }
        }
        return { success: false, error: "NOT_FOUND" };
    }

    // --- 1. Resolve Lookups (Fetch Names) ---
    const lookupResolutions: Record<string, { id: number; name: string; objectApiName: string }> = {};

    for (const field of record.objectDef.fields) {
        if (field.type === "Lookup" && field.lookupTargetId) {
            const fieldData = record.fields.find(f => f.fieldDefId === field.id);
            const targetRecordId = getLookupId(fieldData);
            if (targetRecordId) {
                // Fetch target record's "name" or first text field
                const targetObjectDef = await db.objectDefinition.findFirst({
                    where: { id: field.lookupTargetId, organizationId },
                    include: {
                        fields: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                        },
                    },
                });

                if (targetObjectDef) {
                    const nameField = targetObjectDef.fields.find(f => f.apiName === "name") || targetObjectDef.fields.find(f => f.type === "Text");

                    const targetRecord = await db.record.findFirst({
                        where: {
                            id: targetRecordId,
                            organizationId,
                            objectDefId: targetObjectDef.id,
                        },
                        include: {
                            fields: {
                                where: { fieldDefId: nameField?.id },
                                select: { valueText: true }
                            }
                        }
                    });

                    if (targetRecord) {
                        const targetName = targetRecord.name || targetRecord.fields[0]?.valueText || `Record #${targetRecord.id}`;

                        lookupResolutions[field.apiName] = {
                            id: targetRecord.id,
                            name: targetName,
                            objectApiName: targetObjectDef.apiName
                        };
                    }
                }
            }
        }
    }

    // --- 2. Fetch Related Records (Related Lists) ---
    // Find all fields in OTHER objects that lookup to THIS object
    const relatedLists: any[] = [];

    const childFields = await db.fieldDefinition.findMany({
        where: {
            lookupTargetId: record.objectDefId,
            objectDef: { organizationId }
        },
        include: {
            objectDef: true
        }
    });

    for (const childField of childFields) {
        const childApiName = childField.objectDef.apiName;
        const canViewAllChild = await checkPermission(userId, organizationId, childApiName, "viewAll");
        if (!canViewAllChild) {
            const canReadChild = await checkPermission(userId, organizationId, childApiName, "read");
            if (!canReadChild) {
                continue;
            }
        }

        const childAccessFilter = canViewAllChild ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);

        // For each child object, find records that point to this record
        const childRecords = await db.record.findMany({
            where: {
                objectDefId: childField.objectDefId,
                fields: {
                    some: {
                        fieldDefId: childField.id,
                        valueLookup: recordId
                    }
                },
                ...(childAccessFilter ?? {})
            },
            take: 5, // Limit to 5 for preview
            orderBy: { createdAt: "desc" },
            include: {
                fields: {
                    include: {
                        fieldDef: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                        },
                        valuePicklist: true,
                    }
                }
            }
        });

        // Resolve names for child records
        const formattedChildRecords = childRecords.map(child => {
            return {
                id: child.id,
                name: child.name || `Record #${child.id}`, // Placeholder, improved below
                createdAt: child.createdAt
            };
        });

        // Better name resolution for child records
        // We need the fields of the child object to know which one is "name"
        const childObjectDef = await db.objectDefinition.findUnique({
            where: { id: childField.objectDefId },
            include: {
                fields: {
                    include: {
                        picklistOptions: { orderBy: { sortOrder: "asc" } },
                    },
                },
            },
        });

        if (childObjectDef) {
            const nameFieldDef = childObjectDef.fields.find(f => f.apiName === "name") || childObjectDef.fields.find(f => f.type === "Text");

            formattedChildRecords.forEach(child => {
                const originalRecord = childRecords.find(r => r.id === child.id);
                if (originalRecord && nameFieldDef && !child.name) {
                    const val = originalRecord.fields.find(f => f.fieldDefId === nameFieldDef.id)?.valueText;
                    if (val) child.name = val;
                }
            });
        }

        relatedLists.push({
            objectLabel: childField.objectDef.pluralLabel,
            objectApiName: childField.objectDef.apiName,
            fieldLabel: childField.label,
            fieldApiName: childField.apiName,
            records: formattedChildRecords
        });
    }

    // Transform
    const data: any = {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ownerId: record.ownerId,
        backingUserId: (record as any).backingUserId ?? null,
        ownerName:
            record.ownerType === OwnerType.QUEUE
                ? (record.ownerQueue?.name || "Queue")
                : (record.owner?.name || record.owner?.email || "Unassigned"),
        ownerUserRecordId:
            record.ownerType === OwnerType.USER ? record.owner?.companionRecord?.id ?? null : null,
        createdByName: record.createdBy.name,
        lastModifiedByName: record.lastModifiedBy?.name || null,
        objectApiName: record.objectDef.apiName,
        name: record.name ?? undefined,
        ownerType: record.ownerType,
        ownerQueueId: record.ownerQueueId,
    };

    record.fields.forEach((fieldData: any) => {
        data[fieldData.fieldDef.apiName] = getFieldDisplayValue(fieldData);
    });

    const fileFields = record.objectDef.fields.filter((field: any) => field.type === "File");
    if (fileFields.length > 0) {
        const fileAttachmentDelegate = (db as any).fileAttachment;
        if (!fileAttachmentDelegate?.findMany) {
            console.warn("FileAttachment model not available. Run prisma generate/migrate to enable file fields.");
        } else {
            type FileAttachmentRow = {
                id: number;
                fieldDefId: number;
                displayName: string | null;
                filename: string | null;
                mimeType: string | null;
                size: number | null;
            };

            const attachments: FileAttachmentRow[] = await fileAttachmentDelegate.findMany({
                where: { organizationId, recordId: record.id },
                select: {
                    id: true,
                    fieldDefId: true,
                    displayName: true,
                    filename: true,
                    mimeType: true,
                    size: true,
                },
            });

            const attachmentMap = new Map<number, FileAttachmentRow>(
                attachments.map((attachment) => [attachment.fieldDefId, attachment])
            );

            fileFields.forEach((field: any) => {
                const attachment = attachmentMap.get(field.id);
                data[field.apiName] = attachment
                    ? {
                        id: attachment.id,
                        displayName: attachment.displayName,
                        filename: attachment.filename,
                        mimeType: attachment.mimeType,
                        size: attachment.size,
                        downloadUrl: `/api/files/${attachment.id}`,
                    }
                    : null;
            });
        }
    }

    const fieldHistoryRows = await db.fieldHistory.findMany({
        where: {
            recordId,
            organizationId,
        },
        include: {
            fieldDef: {
                select: {
                    type: true,
                    lookupTargetId: true,
                },
            },
            changedBy: {
                select: {
                    name: true,
                    email: true,
                },
            },
        },
        orderBy: { changedAt: "desc" },
        take: 100,
    });

    const lookupIds = new Set<number>();
    const lookupTargetIds = new Set<number>();
    fieldHistoryRows.forEach((row) => {
        if (row.fieldDef.type !== "Lookup") return;
        if (row.fieldDef.lookupTargetId) lookupTargetIds.add(row.fieldDef.lookupTargetId);
        if (row.oldValueLookup) lookupIds.add(row.oldValueLookup);
        if (row.newValueLookup) lookupIds.add(row.newValueLookup);
    });

    const historyLookupLabels: Record<number, string> = {};
    if (lookupIds.size > 0) {
        const lookupRecords = await db.record.findMany({
            where: {
                organizationId,
                ...(lookupTargetIds.size > 0
                    ? { objectDefId: { in: Array.from(lookupTargetIds) } }
                    : {}),
                id: { in: Array.from(lookupIds) },
            },
            select: { id: true, name: true },
        });

        lookupRecords.forEach((lookupRecord) => {
            historyLookupLabels[lookupRecord.id] = lookupRecord.name || `Record #${lookupRecord.id}`;
        });
    }

    const fieldHistoryEntries = fieldHistoryRows.map((row) => ({
        id: row.id,
        fieldApiNameSnapshot: row.fieldApiNameSnapshot,
        fieldLabelSnapshot: row.fieldLabelSnapshot,
        fieldType: row.fieldDef.type,
        lookupTargetId: row.fieldDef.lookupTargetId,
        oldValueText: row.oldValueText,
        oldValueNumber: row.oldValueNumber ? row.oldValueNumber.toString() : null,
        oldValueDate: row.oldValueDate ? row.oldValueDate.toISOString() : null,
        oldValueBoolean: row.oldValueBoolean,
        oldValueLookup: row.oldValueLookup,
        newValueText: row.newValueText,
        newValueNumber: row.newValueNumber ? row.newValueNumber.toString() : null,
        newValueDate: row.newValueDate ? row.newValueDate.toISOString() : null,
        newValueBoolean: row.newValueBoolean,
        newValueLookup: row.newValueLookup,
        changedByName: row.changedBy.name || row.changedBy.email || `User #${row.changedById}`,
        changedAt: row.changedAt.toISOString(),
    }));

    const ownerHistoryRows = await db.recordOwnerHistory.findMany({
        where: {
            recordId,
            organizationId,
        },
        include: {
            oldOwner: { select: { name: true, email: true } },
            oldOwnerQueue: { select: { name: true } },
            newOwner: { select: { name: true, email: true } },
            newOwnerQueue: { select: { name: true } },
            changedBy: { select: { name: true, email: true } },
        },
        orderBy: { changedAt: "desc" },
        take: 100,
    });

    const formatOwnerLabel = (
        ownerType: OwnerType,
        user: { name: string | null; email: string | null } | null,
        queue: { name: string | null } | null,
        userId: number | null,
        queueId: number | null
    ) => {
        if (ownerType === OwnerType.QUEUE) {
            if (queue?.name) return `Queue: ${queue.name}`;
            return queueId ? `Queue #${queueId}` : "Queue";
        }
        if (user?.name) return `User: ${user.name}`;
        if (user?.email) return `User: ${user.email}`;
        return userId ? `User #${userId}` : "User";
    };

    const ownerHistoryEntries = ownerHistoryRows.map((row) => ({
        id: row.id,
        fieldApiNameSnapshot: "owner",
        fieldLabelSnapshot: "Owner",
        fieldType: "Owner",
        lookupTargetId: null,
        oldValueText: formatOwnerLabel(
            row.oldOwnerType,
            row.oldOwner,
            row.oldOwnerQueue,
            row.oldOwnerId,
            row.oldOwnerQueueId
        ),
        oldValueNumber: null,
        oldValueDate: null,
        oldValueBoolean: null,
        oldValueLookup: null,
        newValueText: formatOwnerLabel(
            row.newOwnerType,
            row.newOwner,
            row.newOwnerQueue,
            row.newOwnerId,
            row.newOwnerQueueId
        ),
        newValueNumber: null,
        newValueDate: null,
        newValueBoolean: null,
        newValueLookup: null,
        changedByName: row.changedBy.name || row.changedBy.email || `User #${row.changedById}`,
        changedAt: row.changedAt.toISOString(),
    }));

    const historyEntries = [...fieldHistoryEntries, ...ownerHistoryEntries]
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
        .slice(0, 100);

    return {
        success: true,
        record: data,
        objectDef: record.objectDef,
        lookupResolutions,
        relatedLists,
        historyEntries,
        historyLookupLabels,
    };
}

async function enforceUniqueFields(
    objectDef: any,
    data: Record<string, any>,
    recordId?: number
) {
    const uniqueFields = (objectDef.fields || []).filter(
        (field: any) =>
            (field.isUnique || field.isExternalId) &&
            ["Text", "Email", "Phone"].includes(field.type)
    );

    if (uniqueFields.length === 0) return;

    const errors: Record<string, string> = {};

    for (const field of uniqueFields) {
        if (!(field.apiName in data)) continue;
        const rawValue = data[field.apiName];
        const normalized = normalizeUniqueValue(field.type, rawValue);
        if (!normalized) continue;

        let candidates: Array<{ recordId: number; valueText: string | null; valueSearch: string | null }> = [];

        if (field.type === "Phone") {
            candidates = await db.fieldData.findMany({
                where: {
                    fieldDefId: field.id,
                    ...(recordId ? { recordId: { not: recordId } } : {}),
                    OR: [
                        { valueSearch: normalized },
                        { valueText: String(rawValue).trim() },
                    ],
                },
                select: { recordId: true, valueText: true, valueSearch: true },
                take: 5,
            });
        } else {
            candidates = await db.fieldData.findMany({
                where: {
                    fieldDefId: field.id,
                    valueSearch: normalized,
                    ...(recordId ? { recordId: { not: recordId } } : {}),
                },
                select: { recordId: true, valueText: true, valueSearch: true },
                take: 1,
            });
        }

        const hasConflict = candidates.some((row) => {
            const stored = normalizeStoredUniqueValue(field.type, row.valueText, row.valueSearch);
            return stored === normalized;
        });

        if (hasConflict) {
            errors[field.apiName] = `${field.label} must be unique. The value "${rawValue}" already exists.`;
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new Error(JSON.stringify(errors));
    }
}

async function generateAutoNumberValues(
    tx: Prisma.TransactionClient,
    fields: any[]
) {
    const values = new Map<number, string>();
    for (const field of fields) {
        if (field.type !== "AutoNumber") continue;
        const value = await nextAutoNumberValue(tx, field.id);
        values.set(field.id, value);
    }
    return values;
}

export async function createRecord(objectApiName: string, data: Record<string, any>) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);
    const permissionSetIds = await getUserPermissionSetIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;
    const duplicateConfirmRuleIds = parseDuplicateConfirmRuleIds(data.__duplicateConfirmRuleIds);
    delete data.__duplicateConfirmRuleIds;

    if (objectApiName === USER_OBJECT_API_NAME) {
        return { success: false, error: "User records cannot be created from the standard record editor." };
    }

    // Permission Check
    const hasAccess = await checkPermission(userId, organizationId, objectApiName, "create");
    if (!hasAccess) return { success: false, error: "Insufficient permissions" };

    // 1. Get Object Definition
    const objectDef = await db.objectDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: objectApiName,
            },
        },
        include: {
            fields: {
                include: {
                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                },
            },
            validationRules: {
                where: { isActive: true },
                include: {
                    conditions: {
                        orderBy: { createdAt: "asc" },
                        include: {
                            fieldDef: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                            compareField: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                        },
                    },
                    errorField: true,
                },
            },
        },
    });

    if (!objectDef) {
        return { success: false, error: `Object ${objectApiName} not found` };
    }

    // 2. Normalize + validate payload
    const finalValueMap = buildValueMap(objectDef.fields, data);

    const finalFieldData = extractFieldInputData(objectDef.fields, finalValueMap);

    try {
        validateRecordData(objectDef.fields, finalFieldData);
        await enforceUniqueFields(objectDef, finalFieldData);
        await validateLookupValues(objectDef.fields, finalFieldData, organizationId);
    } catch (e: any) {
        return { success: false, error: e.message };
    }

    try {
        enforceValidationRules(
            objectDef.validationRules as ValidationRuleWithRelations[] | undefined,
            finalValueMap,
            permissionSetIds
        );
    } catch (error: any) {
        return { success: false, error: error.message || "Validation rule failed", errorPlacement: error?.errorPlacement, errorFieldId: error?.errorFieldId };
    }

    const canReadObject = await checkPermission(userId, organizationId, objectApiName, "read");
    const canReadAll =
        canReadObject &&
        ((await checkPermission(userId, organizationId, objectApiName, "viewAll")) ||
            (await checkPermission(userId, organizationId, objectApiName, "modifyAll")));
    const duplicateMatches = await findDuplicateMatches({
        organizationId,
        objectDefId: objectDef.id,
        valueMap: finalValueMap,
        mode: "create",
        canReadObject,
        canReadAll,
        userId,
        queueIds,
        userGroupId,
    });

    if (duplicateMatches.blockingRuleIds.length > 0) {
        return {
            success: false,
            error: "This record matches an active duplicate rule and cannot be saved.",
            duplicateStatus: "block",
            duplicateMatches,
        };
    }

    const unconfirmedWarningRuleIds = duplicateMatches.warningRuleIds.filter(
        (ruleId) => !duplicateConfirmRuleIds.includes(ruleId)
    );
    if (unconfirmedWarningRuleIds.length > 0) {
        return {
            success: false,
            error: "Possible duplicates were found.",
            duplicateStatus: "warn",
            duplicateMatches: {
                ...duplicateMatches,
                warningRuleIds: unconfirmedWarningRuleIds,
            },
        };
    }

    const assignment = await resolveAssignmentRule(organizationId, objectDef.id, objectDef.fields, finalValueMap);

    let ownerId = userId;
    if (assignment?.targetType === AssignmentTargetType.USER && assignment.ownerId) {
        ownerId = assignment.ownerId;
    } else if (data.ownerId !== undefined) {
        const parsedOwner = parseInt(data.ownerId);
        if (!isNaN(parsedOwner)) {
            ownerId = parsedOwner;
        }
    }

    let ownerQueueId: number | null = null;
    if (assignment?.targetType === AssignmentTargetType.QUEUE && assignment.ownerQueueId) {
        ownerQueueId = assignment.ownerQueueId;
    } else if (data.ownerQueueId !== undefined) {
        const parsedQueue = parseInt(data.ownerQueueId);
        if (!isNaN(parsedQueue)) {
            ownerQueueId = parsedQueue;
        }
    }

    if (ownerQueueId) {
        const queue = await db.queue.findFirst({
            where: { id: ownerQueueId, organizationId },
            select: { id: true },
        });
        if (!queue) {
            return { success: false, error: "Queue not found." };
        }
    } else {
        const owner = await db.user.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true },
        });
        if (!owner) {
            return { success: false, error: "Owner user not found." };
        }
    }

    const ownerType = ownerQueueId ? OwnerType.QUEUE : OwnerType.USER;
    const finalOwnerId = ownerType === OwnerType.QUEUE ? null : ownerId;
    const ownerGroupId =
        ownerType === OwnerType.USER && finalOwnerId
            ? (await db.user.findUnique({
                where: { id: finalOwnerId },
                select: { groupId: true },
            }))?.groupId ?? null
            : null;
    finalValueMap.ownerGroupId = ownerGroupId;

    // 3. Create Record Transaction
    try {
        const nameField = objectDef.fields.find((field: any) => field.apiName === "name") ?? null;
        const recordName = deriveRecordName(objectDef.fields, finalFieldData);
        if (recordName) {
            finalValueMap.name = recordName;
        }

        const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
            const autoNumberValues = await generateAutoNumberValues(tx, objectDef.fields);
            let nextRecordName = recordName;
            if (nameField?.type === "AutoNumber") {
                const generatedName = autoNumberValues.get(nameField.id);
                if (generatedName) {
                    nextRecordName = generatedName;
                    finalValueMap.name = generatedName;
                }
            }

            // Create Record
            const record = await tx.record.create({
                data: {
                    organizationId,
                    objectDefId: objectDef.id,
                    ownerId: finalOwnerId,
                    ownerType,
                    ownerQueueId,
                    createdById: userId,
                    lastModifiedById: userId,
                    name: nextRecordName,
                },
            });

            // Create Field Data
            const fieldDataCreates = [];
            for (const field of objectDef.fields) {
                if (field.type === "File") continue;
                if (field.type === "AutoNumber") {
                    const generated = autoNumberValues.get(field.id);
                    if (generated) {
                        const payload = buildFieldDataPayload(field, generated);
                        fieldDataCreates.push({
                            recordId: record.id,
                            fieldDefId: field.id,
                            ...payload,
                        });
                    }
                    continue;
                }
                if (finalFieldData[field.apiName] !== undefined) {
                    const payload = buildFieldDataPayload(field, finalFieldData[field.apiName]);
                    fieldDataCreates.push({
                        recordId: record.id,
                        fieldDefId: field.id,
                        ...payload,
                    });
                }
            }

            if (fieldDataCreates.length > 0) {
                await tx.fieldData.createMany({
                    data: fieldDataCreates,
                });
            }

            await createAssignmentNotifications(tx, {
                organizationId,
                recordId: record.id,
                ownerType,
                ownerId: finalOwnerId,
                ownerQueueId,
                objectLabel: objectDef.label,
                recordName: nextRecordName,
                notifyOnAssignment: objectDef.notifyOnAssignment,
            });

            if (ownerType === OwnerType.USER) {
                await applySharingRules(tx, organizationId, objectDef.id, record.id, objectDef.fields, finalValueMap);
            }

            return record;
        });

        revalidatePath(`/app/${objectApiName}`);
        return { success: true, data: result };
    } catch (error) {
        console.error("Create Record Error:", error);
        return { success: false, error: "Failed to create record" };
    }
}

export async function updateRecord(objectApiName: string, recordId: number, data: Record<string, any>) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);
    const permissionSetIds = await getUserPermissionSetIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;
    const duplicateConfirmRuleIds = parseDuplicateConfirmRuleIds(data.__duplicateConfirmRuleIds);
    delete data.__duplicateConfirmRuleIds;

    // Permission Check
    const canModifyAll = await checkPermission(userId, organizationId, objectApiName, "modifyAll");

    if (!canModifyAll) {
        const canEdit = await checkPermission(userId, organizationId, objectApiName, "edit");
        if (!canEdit) return { success: false, error: "Insufficient permissions" };
    }

    // 1. Get Record & Definition
    const accessFilter = canModifyAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId, "edit");
    const record = await db.record.findFirst({
        where: {
            id: recordId,
            organizationId,
            ...(accessFilter ?? {}),
        },
        include: {
            objectDef: {
                include: {
                    fields: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                    validationRules: {
                        where: { isActive: true },
                        include: {
                            conditions: {
                                orderBy: { createdAt: "asc" },
                                include: {
                                    fieldDef: {
                                        include: {
                                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                                        },
                                    },
                                    compareField: {
                                        include: {
                                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            fields: {
                include: {
                    fieldDef: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                    valuePicklist: true,
                },
            },
        },
    });

    if (!record) {
        const canViewAll = await checkPermission(userId, organizationId, objectApiName, "viewAll");
        const readFilter = canViewAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId, "read");
        const readable = await db.record.findFirst({
            where: {
                id: recordId,
                organizationId,
                ...(readFilter ?? {}),
            },
            select: { id: true },
        });

        if (readable) {
            return {
                success: false,
                error: "You have read-only access to this record. Ask the owner or an admin to reassign it.",
                errorPlacement: "inline",
            };
        }
        return { success: false, error: "Record not found" };
    }

    const valueMap = buildValueMap(
        record.objectDef.fields,
        data,
        record.fields,
        {
            id: record.id,
            ownerId: record.ownerId,
            name: record.name ?? undefined,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        }
    );

    const finalValueMap = valueMap;

    const finalFieldData = extractFieldInputData(record.objectDef.fields, finalValueMap);
    // Update-time field validators should only re-check explicit inputs and fields
    // whose final values changed.
    const updateValidationFieldData = extractUpdateValidationFieldData(
        record.objectDef.fields,
        data,
        finalValueMap,
        record.fields
    );

    try {
        validateRecordData(record.objectDef.fields, updateValidationFieldData, {
            ignoreMissingRequired: true,
        });
        await enforceUniqueFields(record.objectDef, updateValidationFieldData, record.id);
        await validateLookupValues(record.objectDef.fields, updateValidationFieldData, organizationId);
    } catch (e: any) {
        return { success: false, error: e.message };
    }

    try {
        enforceValidationRules(
            record.objectDef.validationRules as ValidationRuleWithRelations[] | undefined,
            finalValueMap,
            permissionSetIds
        );
    } catch (error: any) {
        return { success: false, error: error.message || "Validation rule failed", errorPlacement: error?.errorPlacement, errorFieldId: error?.errorFieldId };
    }

    const canReadObject = await checkPermission(userId, organizationId, objectApiName, "read");
    const canReadAll = canReadObject && (canModifyAll || (await checkPermission(userId, organizationId, objectApiName, "viewAll")));
    const duplicateMatches = await findDuplicateMatches({
        organizationId,
        objectDefId: record.objectDefId,
        valueMap: finalValueMap,
        mode: "edit",
        recordId: record.id,
        canReadObject,
        canReadAll,
        userId,
        queueIds,
        userGroupId,
    });

    if (duplicateMatches.blockingRuleIds.length > 0) {
        return {
            success: false,
            error: "This record matches an active duplicate rule and cannot be saved.",
            duplicateStatus: "block",
            duplicateMatches,
        };
    }

    const unconfirmedWarningRuleIds = duplicateMatches.warningRuleIds.filter(
        (ruleId) => !duplicateConfirmRuleIds.includes(ruleId)
    );
    if (unconfirmedWarningRuleIds.length > 0) {
        return {
            success: false,
            error: "Possible duplicates were found.",
            duplicateStatus: "warn",
            duplicateMatches: {
                ...duplicateMatches,
                warningRuleIds: unconfirmedWarningRuleIds,
            },
        };
    }

    const fieldPayloads = buildChangedFieldPayloads(record.objectDef.fields, finalFieldData, record.fields);
    const primaryNameField = getPrimaryNameField(record.objectDef.fields);
    const shouldUpdateName = primaryNameField
        ? primaryNameField.type !== "AutoNumber" && fieldPayloads.has(primaryNameField.id)
        : false;
    const nextRecordName = shouldUpdateName ? deriveRecordName(record.objectDef.fields, finalFieldData) : undefined;

    // 3. Update Transaction
    try {
        await db.$transaction(async (tx: Prisma.TransactionClient) => {
            const standardUpdates: Record<string, any> = {
                lastModifiedById: userId,
            };

            if (data.ownerId !== undefined) {
                const parsedOwner = parseInt(data.ownerId);
                if (!isNaN(parsedOwner)) {
                    standardUpdates.ownerId = parsedOwner;
                }
            }

            if (data.ownerQueueId !== undefined) {
                const parsedQueue = parseInt(data.ownerQueueId);
                standardUpdates.ownerQueueId = !isNaN(parsedQueue) ? parsedQueue : null;
            }

        if (standardUpdates.ownerQueueId !== undefined) {
            standardUpdates.ownerType = standardUpdates.ownerQueueId ? OwnerType.QUEUE : OwnerType.USER;
            if (standardUpdates.ownerQueueId) {
                standardUpdates.ownerId = null;
            }
        } else if (standardUpdates.ownerId !== undefined) {
            standardUpdates.ownerType = OwnerType.USER;
            standardUpdates.ownerQueueId = null;
        }

            if (standardUpdates.ownerQueueId !== undefined) {
                if (standardUpdates.ownerQueueId) {
                    const queue = await tx.queue.findFirst({
                        where: { id: standardUpdates.ownerQueueId, organizationId },
                        select: { id: true },
                    });
                    if (!queue) {
                        throw new Error("Queue not found.");
                    }
                }
            } else if (standardUpdates.ownerId !== undefined) {
                const owner = await tx.user.findFirst({
                    where: { id: standardUpdates.ownerId, organizationId },
                    select: { id: true },
                });
                if (!owner) {
                    throw new Error("Owner user not found.");
                }
            }

            if (shouldUpdateName) {
                standardUpdates.name = nextRecordName ?? null;
            }

            await tx.record.update({
                where: { id: recordId },
                data: standardUpdates,
            });

            const nextOwnerType = (standardUpdates.ownerType ?? record.ownerType) as OwnerType;
            const nextOwnerId = (standardUpdates.ownerId ?? record.ownerId) as number | null;
            const nextOwnerQueueId =
                standardUpdates.ownerQueueId !== undefined ? standardUpdates.ownerQueueId : record.ownerQueueId;
            const ownerGroupId =
                nextOwnerType === OwnerType.USER && nextOwnerId
                    ? (await tx.user.findUnique({
                        where: { id: nextOwnerId },
                        select: { groupId: true },
                    }))?.groupId ?? null
                    : null;
            finalValueMap.ownerGroupId = ownerGroupId;

            const ownerTypeChanged = record.ownerType !== nextOwnerType;
            const ownerQueueChanged =
                nextOwnerType === OwnerType.QUEUE && record.ownerQueueId !== nextOwnerQueueId;
            const ownerUserChanged =
                nextOwnerType === OwnerType.USER && record.ownerId !== nextOwnerId;
            const normalizedNextOwnerId = nextOwnerType === OwnerType.USER ? nextOwnerId : null;
            const normalizedNextOwnerQueueId = nextOwnerType === OwnerType.QUEUE ? (nextOwnerQueueId ?? null) : null;

            if (nextOwnerType === OwnerType.QUEUE) {
                await tx.recordShare.deleteMany({
                    where: {
                        recordId,
                        organizationId,
                        principalType: PrincipalType.GROUP,
                    },
                });
            }

            const historyEntries: Prisma.FieldHistoryCreateManyInput[] = [];

            // Upsert Field Data
            for (const field of record.objectDef.fields) {
                if (field.type === "File") continue;
                const payload = fieldPayloads.get(field.id);
                if (payload) {
                    const existingSnapshot = record.fields.find(f => f.fieldDefId === field.id) as FieldValueContainer | undefined;
                    if (hasFieldValueChanged(field.type, existingSnapshot ?? null, payload)) {
                        const isPicklist = field.type === "Picklist";
                        const picklistOptions = Array.isArray(field.picklistOptions) ? field.picklistOptions : [];
                        const oldPicklistId = existingSnapshot?.valuePicklistId ?? null;
                        const newPicklistId = payload.valuePicklistId ?? null;
                        const oldPicklistLabel =
                            isPicklist && oldPicklistId
                                ? existingSnapshot?.valuePicklist?.label ??
                                  picklistOptions.find((opt: any) => opt.id === oldPicklistId)?.label ??
                                  `Option #${oldPicklistId}`
                                : null;
                        const newPicklistLabel =
                            isPicklist && newPicklistId
                                ? picklistOptions.find((opt: any) => opt.id === newPicklistId)?.label ??
                                  `Option #${newPicklistId}`
                                : null;

                        historyEntries.push({
                            organizationId,
                            recordId,
                            objectDefId: record.objectDefId,
                            fieldDefId: field.id,
                            fieldApiNameSnapshot: field.apiName,
                            fieldLabelSnapshot: field.label,
                            oldValueText: isPicklist ? oldPicklistLabel : existingSnapshot?.valueText ?? null,
                            oldValueNumber: existingSnapshot?.valueNumber ?? null,
                            oldValueDate: existingSnapshot?.valueDate ?? null,
                            oldValueBoolean: existingSnapshot?.valueBoolean ?? null,
                            oldValueLookup: existingSnapshot?.valueLookup ?? null,
                            newValueText: isPicklist ? newPicklistLabel : payload.valueText ?? null,
                            newValueNumber: payload.valueNumber ?? null,
                            newValueDate: payload.valueDate ?? null,
                            newValueBoolean: payload.valueBoolean ?? null,
                            newValueLookup: payload.valueLookup ?? null,
                            changedById: userId,
                        });
                    }

                    // Check if field data exists
                    const existingFieldData = await tx.fieldData.findUnique({
                        where: {
                            recordId_fieldDefId: {
                                recordId,
                                fieldDefId: field.id,
                            },
                        },
                    });

                    if (existingFieldData) {
                        await tx.fieldData.update({
                            where: { id: existingFieldData.id },
                            data: payload,
                        });
                    } else {
                        await tx.fieldData.create({
                            data: {
                                recordId,
                                fieldDefId: field.id,
                                ...payload,
                            },
                        });
                    }
                }
            }

            if (historyEntries.length > 0) {
                await tx.fieldHistory.createMany({ data: historyEntries });
            }

            if (nextOwnerType === OwnerType.USER) {
                await applySharingRules(tx, organizationId, record.objectDefId, recordId, record.objectDef.fields, finalValueMap);
            }

            if (ownerTypeChanged || ownerQueueChanged || ownerUserChanged) {
                await tx.recordOwnerHistory.create({
                    data: {
                        organizationId,
                        recordId,
                        objectDefId: record.objectDefId,
                        oldOwnerType: record.ownerType,
                        oldOwnerId: record.ownerId,
                        oldOwnerQueueId: record.ownerQueueId,
                        newOwnerType: nextOwnerType,
                        newOwnerId: normalizedNextOwnerId,
                        newOwnerQueueId: normalizedNextOwnerQueueId,
                        changedById: userId,
                    },
                });
            }

            if (
                (nextOwnerType === OwnerType.QUEUE && nextOwnerQueueId && (ownerTypeChanged || ownerQueueChanged)) ||
                (nextOwnerType === OwnerType.USER && (ownerTypeChanged || ownerUserChanged))
            ) {
                const effectiveName = shouldUpdateName ? (nextRecordName ?? null) : record.name;
                await createAssignmentNotifications(tx, {
                    organizationId,
                    recordId,
                    ownerType: nextOwnerType,
                    ownerId: normalizedNextOwnerId,
                    ownerQueueId: normalizedNextOwnerQueueId,
                    objectLabel: record.objectDef.label,
                    recordName: effectiveName,
                    notifyOnAssignment: record.objectDef.notifyOnAssignment,
                });
            }
        });

        revalidatePath(`/app/${record.objectDef.apiName}`);
        return { success: true };
    } catch (error) {
        console.error("Update Record Error:", error);
        if (error instanceof Error) {
            if (error.message === "Queue not found." || error.message === "Owner user not found.") {
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: "Failed to update record" };
    }
}

export async function updateOwnUserRecord(recordId: number, data: Record<string, any>) {
    const { userId, organizationId } = await getUserContext();
    const permissionSetIds = await getUserPermissionSetIds(userId);

    const record = await db.record.findFirst({
        where: {
            id: recordId,
            organizationId,
            backingUserId: userId,
            objectDef: {
                apiName: USER_OBJECT_API_NAME,
            },
        },
        include: {
            objectDef: {
                include: {
                    fields: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                    validationRules: {
                        where: { isActive: true },
                        include: {
                            conditions: {
                                orderBy: { createdAt: "asc" },
                                include: {
                                    fieldDef: {
                                        include: {
                                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                                        },
                                    },
                                    compareField: {
                                        include: {
                                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                                        },
                                    },
                                },
                            },
                            errorField: true,
                        },
                    },
                },
            },
            fields: {
                include: {
                    fieldDef: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                    valuePicklist: true,
                },
            },
        },
    });

    if (!record) {
        return { success: false, error: "User record not found." };
    }

    const disallowedKeys = ["ownerId", "ownerQueueId", USER_ID_FIELD_API_NAME];
    const invalidKey = Object.keys(data).find((key) => disallowedKeys.includes(key));
    if (invalidKey) {
        return { success: false, error: `${invalidKey} cannot be edited here.` };
    }

    const editableFields = record.objectDef.fields.filter(
        (field: any) => field.apiName === "name" || (field.apiName !== USER_ID_FIELD_API_NAME && field.apiName !== "name")
    );

    try {
        validateRecordData(editableFields, data);
        await enforceUniqueFields(record.objectDef, data, record.id);
        await validateLookupValues(editableFields, data, organizationId);
    } catch (e: any) {
        return { success: false, error: e.message };
    }

    const valueMap = buildValueMap(
        record.objectDef.fields,
        data,
        record.fields,
        {
            id: record.id,
            ownerId: record.ownerId,
            name: record.name ?? undefined,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        }
    );

    try {
        enforceValidationRules(
            record.objectDef.validationRules as ValidationRuleWithRelations[] | undefined,
            valueMap,
            permissionSetIds
        );
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Validation rule failed",
            errorPlacement: error?.errorPlacement,
            errorFieldId: error?.errorFieldId,
        };
    }

    const nextName =
        Object.prototype.hasOwnProperty.call(data, "name") && typeof data.name === "string"
            ? data.name.trim()
            : record.name ?? `User #${userId}`;

    try {
        await db.$transaction(async (tx) => {
            if (Object.prototype.hasOwnProperty.call(data, "name")) {
                await tx.user.update({
                    where: { id: userId },
                    data: { name: nextName },
                });

                await tx.record.update({
                    where: { id: record.id },
                    data: {
                        name: nextName,
                        lastModifiedById: userId,
                        ownerId: userId,
                        ownerType: OwnerType.USER,
                        ownerQueueId: null,
                        backingUserId: userId,
                    },
                });
            } else {
                await tx.record.update({
                    where: { id: record.id },
                    data: { lastModifiedById: userId },
                });
            }

            for (const field of record.objectDef.fields) {
                if (field.apiName === USER_ID_FIELD_API_NAME || field.type === "File" || field.type === "AutoNumber") {
                    continue;
                }
                if (!Object.prototype.hasOwnProperty.call(data, field.apiName)) continue;

                const payload = buildFieldDataPayload(field, data[field.apiName]);
                await tx.fieldData.upsert({
                    where: {
                        recordId_fieldDefId: {
                            recordId: record.id,
                            fieldDefId: field.id,
                        },
                    },
                    create: {
                        recordId: record.id,
                        fieldDefId: field.id,
                        ...payload,
                    },
                    update: payload,
                });
            }
        });

        revalidatePath(`/app`);
        return { success: true };
    } catch (error) {
        console.error("Update Own User Record Error:", error);
        return { success: false, error: "Failed to update user record." };
    }
}

export async function claimRecord(objectApiName: string, recordId: number) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);

    if (objectApiName === USER_OBJECT_API_NAME) {
        return { success: false, error: "User records cannot be queue-owned or claimed." };
    }

    const canModifyAll = await checkPermission(userId, organizationId, objectApiName, "modifyAll");
    const canEdit = canModifyAll ? true : await checkPermission(userId, organizationId, objectApiName, "edit");

    if (!canEdit) {
        return { success: false, error: "Insufficient permissions" };
    }

    const record = await db.record.findFirst({
        where: {
            id: recordId,
            organizationId,
        },
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
            fields: {
                include: {
                    fieldDef: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                    valuePicklist: true,
                },
            },
        },
    });

    if (!record) {
        return { success: false, error: "Record not found" };
    }

    if (record.ownerType !== OwnerType.QUEUE || !record.ownerQueueId) {
        return { success: false, error: "Record is not owned by a queue" };
    }

    if (!queueIds.includes(record.ownerQueueId)) {
        return { success: false, error: "You are not a member of this queue" };
    }

    const valueMap = buildValueMap(record.objectDef.fields, {}, record.fields, {
        id: record.id,
        ownerId: userId,
        name: record.name ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    });

    try {
        await db.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.record.update({
                where: { id: record.id },
                data: {
                    ownerType: OwnerType.USER,
                    ownerId: userId,
                    ownerQueueId: null,
                    lastModifiedById: userId,
                },
            });

            await tx.recordOwnerHistory.create({
                data: {
                    organizationId,
                    recordId: record.id,
                    objectDefId: record.objectDefId,
                    oldOwnerType: record.ownerType,
                    oldOwnerId: record.ownerId,
                    oldOwnerQueueId: record.ownerQueueId,
                    newOwnerType: OwnerType.USER,
                    newOwnerId: userId,
                    newOwnerQueueId: null,
                    changedById: userId,
                },
            });

            await tx.recordShare.deleteMany({
                where: {
                    recordId: record.id,
                    organizationId,
                },
            });

            const ownerGroupId = (await tx.user.findUnique({
                where: { id: userId },
                select: { groupId: true },
            }))?.groupId ?? null;
            valueMap.ownerGroupId = ownerGroupId;

            await applySharingRules(
                tx,
                organizationId,
                record.objectDefId,
                record.id,
                record.objectDef.fields,
                valueMap
            );
        });

        revalidatePath(`/app/${objectApiName}`);
        return { success: true };
    } catch (error) {
        console.error("Claim Record Error:", error);
        return { success: false, error: "Failed to claim record" };
    }
}

export async function deleteRecord(appApiName: string, objectApiName: string, recordId: number) {
    const { userId, organizationId } = await getUserContext();
    const queueIds = await getUserQueueIds(userId);
    const userGroupId = (await db.user.findUnique({
        where: { id: userId },
        select: { groupId: true },
    }))?.groupId ?? null;

    // Permission Check
    const canModifyAll = await checkPermission(userId, organizationId, objectApiName, "modifyAll");

    if (!canModifyAll) {
        const canDelete = await checkPermission(userId, organizationId, objectApiName, "delete");
        if (!canDelete) return { success: false, error: "Insufficient permissions" };
    }

    try {
        const accessFilter = canModifyAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId, "delete");
        const record = await db.record.findFirst({
            where: {
                id: recordId,
                organizationId,
                ...(accessFilter ?? {}),
            },
            include: { objectDef: true },
        });

        if (!record) {
            return { success: false, error: "Record not found" };
        }

        const childLookupFields = await db.fieldDefinition.findMany({
            where: {
                lookupTargetId: record.objectDefId,
                objectDef: { organizationId },
            },
            include: {
                objectDef: {
                    select: { apiName: true },
                },
            },
        });

        const impactedObjectApiNames = [...new Set(childLookupFields.map((field) => field.objectDef.apiName))];

        await db.$transaction(async (tx: Prisma.TransactionClient) => {
            if (childLookupFields.length > 0) {
                // Lookup values are duplicated into text/search columns for
                // list rendering and filtering. Clear the whole lookup payload
                // so child records render as empty instead of showing the old id.
                await tx.fieldData.updateMany({
                    where: {
                        fieldDefId: { in: childLookupFields.map((field) => field.id) },
                        valueLookup: recordId,
                    },
                    data: {
                        valueLookup: null,
                        valueText: null,
                        valueSearch: null,
                    },
                });
            }

            // Record-owned children cascade in Prisma/schema (comments, shares,
            // field data, history, attachments metadata), so the hard delete
            // itself stays narrow once inbound lookups are handled.
            await tx.record.delete({
                where: { id: recordId },
            });
        });

        try {
            // Attachments live under a per-record folder, so post-commit cleanup
            // can safely remove the subtree without touching other records.
            await deleteFolderSafe(resolveStoragePath(`uploads/${organizationId}/${recordId}`));
        } catch (cleanupError) {
            console.warn("Attachment cleanup failed:", cleanupError);
        }

        revalidatePath(`/app/${appApiName}/${objectApiName}`);
        revalidatePath(`/app/${appApiName}/${objectApiName}/${recordId}`);
        for (const childObjectApiName of impactedObjectApiNames) {
            revalidatePath(`/app/${appApiName}/${childObjectApiName}`);
        }
        return { success: true };
    } catch (error) {
        console.error("Delete Record Error:", error);
        return { success: false, error: "Failed to delete record" };
    }
}
