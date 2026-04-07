import { db } from "@/lib/db";
import { buildFieldDataPayload } from "@/lib/field-data";
import { buildRecordAccessFilter } from "@/lib/record-access";
import { evaluateCustomLogicExpression } from "@/lib/validation/rule-logic";
import { DuplicateRuleAction } from "@prisma/client";

type DuplicateMode = "create" | "edit";

type DuplicateMatchSummary = {
    recordId: number;
    name: string;
    matchedRuleNames: string[];
    matchedFieldLabels: string[];
};

type FindDuplicateMatchesInput = {
    organizationId: number;
    objectDefId: number;
    valueMap: Record<string, any>;
    mode: DuplicateMode;
    recordId?: number;
    canReadObject: boolean;
    canReadAll: boolean;
    userId: number;
    queueIds: number[];
    userGroupId: number | null;
    includeReadableMatches?: boolean;
};

type CandidateCondition = {
    fieldDefId: number;
    fieldLabel: string;
    fieldType: string;
    fieldApiName: string;
    comparableValue: string | number | null;
};

function getComparableStoredValue(
    fieldType: string,
    value: {
        valueText: string | null;
        valueSearch: string | null;
        valueDate: Date | null;
        valueLookup: number | null;
        valuePicklistId: number | null;
    }
) {
    switch (fieldType) {
        case "Date":
            return value.valueDate ? value.valueDate.toISOString().slice(0, 10) : null;
        case "Lookup":
            return value.valueLookup ?? null;
        case "Picklist":
            return value.valuePicklistId ?? null;
        default:
            return value.valueSearch ?? null;
    }
}

function getComparableIncomingValue(field: { type: string }, rawValue: unknown) {
    const payload = buildFieldDataPayload(field as any, rawValue);
    return getComparableStoredValue(field.type, {
        valueText: payload.valueText,
        valueSearch: payload.valueSearch,
        valueDate: payload.valueDate,
        valueLookup: payload.valueLookup,
        valuePicklistId: payload.valuePicklistId,
    });
}

function resolveRuleAction(rule: { createAction: DuplicateRuleAction; editAction: DuplicateRuleAction }, mode: DuplicateMode) {
    return mode === "create" ? rule.createAction : rule.editAction;
}

function matchesRule(
    rule: { logicOperator: string; logicExpression: string | null },
    conditionMatches: boolean[]
) {
    if (rule.logicOperator === "ANY") {
        return conditionMatches.some(Boolean);
    }
    if (rule.logicOperator === "CUSTOM") {
        if (!rule.logicExpression) return false;
        return Boolean(evaluateCustomLogicExpression(rule.logicExpression, conditionMatches));
    }
    return conditionMatches.every(Boolean);
}

export async function findDuplicateMatches(input: FindDuplicateMatchesInput) {
    const rules = await db.duplicateRule.findMany({
        where: {
            organizationId: input.organizationId,
            objectDefId: input.objectDefId,
            isActive: true,
        },
        include: {
            conditions: {
                include: {
                    fieldDef: {
                        select: {
                            id: true,
                            label: true,
                            apiName: true,
                            type: true,
                        },
                    },
                },
                orderBy: { sortOrder: "asc" },
            },
        },
        orderBy: { sortOrder: "asc" },
    });

    const blockingRuleIds = new Set<number>();
    const warningRuleIds = new Set<number>();
    const matchedRecordRuleNames = new Map<number, Set<string>>();
    const matchedRecordFieldLabels = new Map<number, Set<string>>();

    for (const rule of rules) {
        const action = resolveRuleAction(rule, input.mode);
        if (action === DuplicateRuleAction.NONE) continue;
        if (rule.conditions.length < 2) continue;

        const conditions: CandidateCondition[] = rule.conditions.map((condition) => ({
            fieldDefId: condition.fieldDefId,
            fieldLabel: condition.fieldDef.label,
            fieldType: condition.fieldDef.type,
            fieldApiName: condition.fieldDef.apiName,
            comparableValue: getComparableIncomingValue(condition.fieldDef, input.valueMap[condition.fieldDef.apiName]),
        }));

        const activeConditions = conditions.filter((condition) => condition.comparableValue !== null);
        if (activeConditions.length === 0) continue;

        const candidateIds = new Set<number>();
        for (const condition of activeConditions) {
            const where =
                condition.fieldType === "Date"
                    ? { fieldDefId: condition.fieldDefId, valueDate: new Date(String(condition.comparableValue)) }
                    : condition.fieldType === "Lookup"
                        ? { fieldDefId: condition.fieldDefId, valueLookup: Number(condition.comparableValue) }
                        : condition.fieldType === "Picklist"
                            ? { fieldDefId: condition.fieldDefId, valuePicklistId: Number(condition.comparableValue) }
                            : { fieldDefId: condition.fieldDefId, valueSearch: String(condition.comparableValue) };

            const rows = await db.fieldData.findMany({
                where,
                select: { recordId: true },
            });
            rows.forEach((row) => {
                if (input.recordId && row.recordId === input.recordId) return;
                candidateIds.add(row.recordId);
            });
        }

        if (candidateIds.size === 0) continue;

        const candidateRecords = await db.record.findMany({
            where: {
                organizationId: input.organizationId,
                objectDefId: input.objectDefId,
                id: { in: Array.from(candidateIds) },
            },
            select: {
                id: true,
                name: true,
                fields: {
                    where: {
                        fieldDefId: { in: conditions.map((condition) => condition.fieldDefId) },
                    },
                    select: {
                        fieldDefId: true,
                        valueText: true,
                        valueSearch: true,
                        valueDate: true,
                        valueLookup: true,
                        valuePicklistId: true,
                    },
                },
            },
        });

        for (const candidate of candidateRecords) {
            const fieldValueMap = new Map(candidate.fields.map((field) => [field.fieldDefId, field]));
            const conditionMatches = conditions.map((condition) => {
                if (condition.comparableValue === null) return false;
                const stored = fieldValueMap.get(condition.fieldDefId);
                if (!stored) return false;
                return getComparableStoredValue(condition.fieldType, stored) === condition.comparableValue;
            });

            if (!matchesRule(rule, conditionMatches)) continue;

            if (action === DuplicateRuleAction.BLOCK) {
                blockingRuleIds.add(rule.id);
            } else if (action === DuplicateRuleAction.WARN) {
                warningRuleIds.add(rule.id);
            }

            const ruleNames = matchedRecordRuleNames.get(candidate.id) ?? new Set<string>();
            ruleNames.add(rule.name);
            matchedRecordRuleNames.set(candidate.id, ruleNames);

            const fieldLabels = matchedRecordFieldLabels.get(candidate.id) ?? new Set<string>();
            conditions.forEach((condition, index) => {
                if (conditionMatches[index]) fieldLabels.add(condition.fieldLabel);
            });
            matchedRecordFieldLabels.set(candidate.id, fieldLabels);
        }
    }

    const matchedRecordIds = Array.from(matchedRecordRuleNames.keys());
    if (matchedRecordIds.length === 0) {
        return {
            blockingRuleIds: [] as number[],
            warningRuleIds: [] as number[],
            visibleMatches: [] as DuplicateMatchSummary[],
            hiddenMatchCount: 0,
        };
    }

    const includeReadableMatches = input.includeReadableMatches ?? true;

    let visibleIds = new Set<number>();
    if (includeReadableMatches && input.canReadObject) {
        if (input.canReadAll) {
            visibleIds = new Set(matchedRecordIds);
        } else {
            const accessibleRecords = await db.record.findMany({
                where: {
                    id: { in: matchedRecordIds },
                    organizationId: input.organizationId,
                    objectDefId: input.objectDefId,
                    ...buildRecordAccessFilter(input.userId, input.queueIds, input.userGroupId, "read"),
                },
                select: { id: true },
            });
            visibleIds = new Set(accessibleRecords.map((record) => record.id));
        }
    }

    const visibleMatches: DuplicateMatchSummary[] = includeReadableMatches
        ? matchedRecordIds
            .filter((recordId) => visibleIds.has(recordId))
            .map((recordId) => ({
                recordId,
                name: `Record #${recordId}`,
                matchedRuleNames: Array.from(matchedRecordRuleNames.get(recordId) ?? []),
                matchedFieldLabels: Array.from(matchedRecordFieldLabels.get(recordId) ?? []),
            }))
        : [];

    if (includeReadableMatches && visibleMatches.length > 0) {
        const visibleRecords = await db.record.findMany({
            where: {
                id: { in: visibleMatches.map((match) => match.recordId) },
                organizationId: input.organizationId,
                objectDefId: input.objectDefId,
            },
            select: { id: true, name: true },
        });
        const nameMap = new Map(visibleRecords.map((record) => [record.id, record.name || `Record #${record.id}`]));
        visibleMatches.forEach((match) => {
            match.name = nameMap.get(match.recordId) || `Record #${match.recordId}`;
        });
    }

    return {
        blockingRuleIds: Array.from(blockingRuleIds),
        warningRuleIds: Array.from(warningRuleIds),
        visibleMatches,
        hiddenMatchCount: includeReadableMatches ? matchedRecordIds.length - visibleMatches.length : matchedRecordIds.length,
    };
}
