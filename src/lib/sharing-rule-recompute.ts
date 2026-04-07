import { db } from "@/lib/db";
import { getFieldDisplayValue } from "@/lib/field-data";
import { OwnerType, PrincipalType, Prisma, ShareAccessLevel } from "@prisma/client";
import { evaluateCustomLogicExpression } from "@/lib/validation/rule-logic";
import { getDateTimeTimestamp, getTemporalComparableValue } from "@/lib/temporal";

type RuleCriteriaFilter = {
    fieldDefId?: number;
    field?: string;
    operator?: string;
    value?: string;
};

type RuleCriteria = {
    logic?: "ALL" | "ANY" | "CUSTOM";
    expression?: string;
    filters?: RuleCriteriaFilter[];
};

function normalizeCriteria(criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined) {
    if (!criteria) {
        return { logic: "ALL" as const, filters: [], expression: undefined };
    }

    if (Array.isArray(criteria)) {
        return { logic: "ALL" as const, filters: criteria, expression: undefined };
    }

    const logic = criteria.logic === "CUSTOM" ? "CUSTOM" : criteria.logic === "ANY" ? "ANY" : "ALL";
    const filters = Array.isArray(criteria.filters) ? criteria.filters : [];
    const expression = typeof criteria.expression === "string" ? criteria.expression : undefined;
    return { logic, filters, expression };
}

function evaluateCustomExpression(expression: string, matches: boolean[]) {
    return evaluateCustomLogicExpression(expression, matches);
}

function coerceFieldValue(fieldType: string, rawValue: any) {
    if (rawValue === undefined || rawValue === null) return null;
    switch (fieldType) {
        case "Number":
        case "Currency": {
            const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue);
            return isNaN(value) ? null : value;
        }
        case "Date": {
            return getTemporalComparableValue(fieldType, rawValue);
        }
        case "DateTime": {
            return getDateTimeTimestamp(rawValue);
        }
        case "Checkbox":
            if (typeof rawValue === "boolean") return rawValue;
            if (typeof rawValue === "string") {
                return rawValue === "true" || rawValue === "1";
            }
            return Boolean(rawValue);
        default:
            return String(rawValue);
    }
}

function evaluateOperator(left: any, right: any, operator: string) {
    if (left === null || right === null) {
        return operator === "is_blank" ? left === null : operator === "is_not_blank" ? left !== null : false;
    }

    switch (operator) {
        case "equals":
            return left === right;
        case "not_equals":
            return left !== right;
        case "gt":
            return typeof left === "number" && typeof right === "number" && left > right;
        case "gte":
            return typeof left === "number" && typeof right === "number" && left >= right;
        case "lt":
            return typeof left === "number" && typeof right === "number" && left < right;
        case "lte":
            return typeof left === "number" && typeof right === "number" && left <= right;
        case "contains":
            return typeof left === "string" && typeof right === "string" && left.toLowerCase().includes(right.toLowerCase());
        case "not_contains":
            return typeof left === "string" && typeof right === "string" && !left.toLowerCase().includes(right.toLowerCase());
        case "is_blank":
            return left === null || left === "";
        case "is_not_blank":
            return !(left === null || left === "");
        default:
            return false;
    }
}

function evaluateCriteria(
    criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined,
    fields: Array<{ id: number; apiName: string; type: string }>,
    valueMap: Record<string, any>
) {
    const { logic, filters, expression } = normalizeCriteria(criteria);
    if (!filters.length) return true;

    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const fieldByApi = new Map(fields.map((field) => [field.apiName, field]));

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
        const customResult = evaluateCustomExpression(expression, matches);
        if (customResult !== null) {
            result = customResult;
        }
    }

    return result;
}

type RecomputePayload = {
    organizationId: number;
    objectDefId: number;
    batchSize?: number;
};

export async function recomputeSharingRulesForObject({
    organizationId,
    objectDefId,
    batchSize = 500,
}: RecomputePayload) {
    const objectDef = await db.objectDefinition.findUnique({
        where: { id: objectDefId, organizationId },
        include: { fields: true },
    });

    if (!objectDef) {
        throw new Error("Object not found.");
    }

    const rules = await db.sharingRule.findMany({
        where: { organizationId, objectDefId, isActive: true },
        orderBy: { sortOrder: "asc" },
    });

    const deleted = await db.recordShare.deleteMany({
        where: {
            organizationId,
            principalType: PrincipalType.GROUP,
            record: { objectDefId },
        },
    });

    if (rules.length === 0) {
        return { deleted: deleted.count, inserted: 0 };
    }

    const accessRank: Record<ShareAccessLevel, number> = {
        [ShareAccessLevel.READ]: 1,
        [ShareAccessLevel.EDIT]: 2,
        [ShareAccessLevel.DELETE]: 3,
    };

    let inserted = 0;
    let lastId = 0;

    while (true) {
        const records = await db.record.findMany({
            where: {
                organizationId,
                objectDefId,
                ownerType: OwnerType.USER,
                id: { gt: lastId },
            },
            orderBy: { id: "asc" },
            take: batchSize,
            include: {
                fields: {
                    include: {
                        fieldDef: true,
                    },
                },
                owner: {
                    select: {
                        groupId: true,
                    },
                },
            },
        });

        if (records.length === 0) break;

        const shareRows: Prisma.RecordShareCreateManyInput[] = [];

        for (const record of records) {
            const valueMap: Record<string, any> = {};
            valueMap.id = record.id;
            if (record.ownerId !== undefined) {
                valueMap.ownerId = record.ownerId;
            }
            valueMap.name = record.name ?? null;
            valueMap.createdAt = record.createdAt?.toISOString?.() ?? record.createdAt;
            valueMap.updatedAt = record.updatedAt?.toISOString?.() ?? record.updatedAt;
            valueMap.ownerGroupId = record.owner?.groupId ?? null;

            for (const fieldData of record.fields) {
                valueMap[fieldData.fieldDef.apiName] = getFieldDisplayValue(fieldData);
            }

            const targetAccess = new Map<number, ShareAccessLevel>();
            for (const rule of rules) {
                if (!evaluateCriteria(rule.criteria as RuleCriteria, objectDef.fields, valueMap)) continue;

                const current = targetAccess.get(rule.targetGroupId);
                if (!current || accessRank[rule.accessLevel] > accessRank[current]) {
                    targetAccess.set(rule.targetGroupId, rule.accessLevel);
                }
            }

            if (targetAccess.size === 0) continue;

            for (const [groupId, accessLevel] of targetAccess.entries()) {
                shareRows.push({
                    recordId: record.id,
                    organizationId,
                    principalType: PrincipalType.GROUP,
                    principalId: groupId,
                    accessLevel,
                });
            }
        }

        if (shareRows.length > 0) {
            await db.recordShare.createMany({ data: shareRows });
            inserted += shareRows.length;
        }

        lastId = records[records.length - 1]?.id ?? lastId;
    }

    return { deleted: deleted.count, inserted };
}
