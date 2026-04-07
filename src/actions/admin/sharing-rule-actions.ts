"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    removeDependenciesForSource,
    syncSharingRuleDependencies,
} from "@/lib/metadata-dependencies";
import { normalizeCustomLogicExpressionOrThrow } from "@/lib/validation/rule-logic";
import { MetadataDependencySourceType, ShareAccessLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueSharingRuleRecompute } from "@/lib/jobs/sharing-rule-jobs";

async function getUserContext() {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized");
    }
    const user = session.user as any;
    if (!user.id || !user.organizationId) {
        throw new Error("Invalid session");
    }
    return {
        userId: parseInt(user.id),
        organizationId: parseInt(user.organizationId),
        userType: user.userType,
    };
}

const criteriaFilterSchema = z.object({
    fieldDefId: z.number().optional(),
    field: z.string().optional(),
    operator: z.string().optional(),
    value: z.string().optional(),
});

const criteriaSchema = z
    .object({
        logic: z.enum(["ALL", "ANY", "CUSTOM"]).optional(),
        expression: z.string().optional(),
        filters: z.array(criteriaFilterSchema).optional(),
    })
    .optional();

const sharingRuleSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().optional(),
    targetGroupId: z.number(),
    accessLevel: z.enum(["READ", "EDIT", "DELETE"]),
    criteria: criteriaSchema,
});

const UNSUPPORTED_CRITERIA_TYPES = new Set(["TextArea", "File"]);
const PICKLIST_ALLOWED_OPERATORS = new Set(["equals", "not_equals", "is_blank", "is_not_blank"]);

function normalizeCriteriaPayload(criteria: z.infer<typeof criteriaSchema> | undefined) {
    if (!criteria) {
        return { logic: "ALL" as const, filters: [] as z.infer<typeof criteriaFilterSchema>[] };
    }

    const logic =
        criteria.logic === "CUSTOM"
            ? "CUSTOM"
            : criteria.logic === "ANY"
                ? "ANY"
                : "ALL";
    const filters = Array.isArray(criteria.filters) ? criteria.filters : [];

    if (logic === "CUSTOM") {
        return {
            logic,
            expression: normalizeCustomLogicExpressionOrThrow(criteria.expression, filters.length),
            filters,
        };
    }

    return { logic, filters };
}

async function validateCriteriaFields(
    organizationId: number,
    objectDefId: number,
    criteria: z.infer<typeof criteriaSchema> | undefined
) {
    const filters = criteria?.filters ?? [];
    if (!filters.length) return;

    const fields = await db.fieldDefinition.findMany({
        where: {
            objectDefId,
            objectDef: { organizationId },
        },
        select: {
            id: true,
            apiName: true,
            type: true,
            picklistOptions: {
                select: { id: true, isActive: true },
            },
        },
    });
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const fieldByApi = new Map(fields.map((field) => [field.apiName, field]));

    for (const filter of filters) {
        const fieldDef =
            filter.fieldDefId !== undefined
                ? fieldById.get(filter.fieldDefId)
                : filter.field
                    ? fieldByApi.get(filter.field)
                    : null;
        if (fieldDef && UNSUPPORTED_CRITERIA_TYPES.has(fieldDef.type)) {
            throw new Error("TextArea and File fields cannot be used in sharing criteria.");
        }
        if (fieldDef?.type === "Picklist") {
            const operator = filter.operator || "equals";
            if (!PICKLIST_ALLOWED_OPERATORS.has(operator)) {
                throw new Error("Picklist criteria can only use equals, not equals, or blank operators.");
            }
            if (operator !== "is_blank" && operator !== "is_not_blank") {
                const picklistId = Number(filter.value);
                const match = fieldDef.picklistOptions?.find((opt) => opt.id === picklistId && opt.isActive);
                if (!match) {
                    throw new Error("Picklist criteria must use an active option.");
                }
            }
        }
    }
}

export async function createSharingRule(data: z.infer<typeof sharingRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = sharingRuleSchema.parse(data);

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: payload.objectDefId, organizationId },
        });
        if (!objectDef) return { success: false, error: "Object not found." };

        await validateCriteriaFields(organizationId, payload.objectDefId, payload.criteria);

        const group = await db.group.findUnique({
            where: { id: payload.targetGroupId, organizationId },
        });
        if (!group) return { success: false, error: "Target group not found." };

        const lastRule = await db.sharingRule.findFirst({
            where: { organizationId, objectDefId: payload.objectDefId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });
        const nextSortOrder = payload.sortOrder ?? (lastRule?.sortOrder ?? 0) + 1;

        const normalizedCriteria = normalizeCriteriaPayload(payload.criteria);

        const created = await db.sharingRule.create({
            data: {
                organizationId,
                objectDefId: payload.objectDefId,
                targetGroupId: payload.targetGroupId,
                name: payload.name,
                description: payload.description,
                isActive: payload.isActive,
                sortOrder: nextSortOrder,
                accessLevel:
                    payload.accessLevel === "DELETE"
                        ? ShareAccessLevel.DELETE
                        : payload.accessLevel === "EDIT"
                            ? ShareAccessLevel.EDIT
                            : ShareAccessLevel.READ,
                criteria: normalizedCriteria,
            },
        });

        await syncSharingRuleDependencies(db, created.id, organizationId);

        await enqueueSharingRuleRecompute({
            organizationId,
            objectDefId: payload.objectDefId,
        });

        revalidatePath("/admin/sharing-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateSharingRule(ruleId: number, data: z.infer<typeof sharingRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = sharingRuleSchema.parse(data);

        const rule = await db.sharingRule.findUnique({
            where: { id: ruleId },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Sharing rule not found." };
        }

        await validateCriteriaFields(organizationId, payload.objectDefId, payload.criteria);

        const group = await db.group.findUnique({
            where: { id: payload.targetGroupId, organizationId },
        });
        if (!group) return { success: false, error: "Target group not found." };

        const previousObjectDefId = rule.objectDefId;

        const normalizedCriteria = normalizeCriteriaPayload(payload.criteria);

        await db.sharingRule.update({
            where: { id: ruleId },
            data: {
                name: payload.name,
                description: payload.description,
                isActive: payload.isActive,
                sortOrder: payload.sortOrder ?? rule.sortOrder,
                targetGroupId: payload.targetGroupId,
                accessLevel:
                    payload.accessLevel === "DELETE"
                        ? ShareAccessLevel.DELETE
                        : payload.accessLevel === "EDIT"
                            ? ShareAccessLevel.EDIT
                            : ShareAccessLevel.READ,
                criteria: normalizedCriteria,
            },
        });

        await syncSharingRuleDependencies(db, ruleId, organizationId);

        await enqueueSharingRuleRecompute({
            organizationId,
            objectDefId: payload.objectDefId,
        });
        if (payload.objectDefId !== previousObjectDefId) {
            await enqueueSharingRuleRecompute({
                organizationId,
                objectDefId: previousObjectDefId,
            });
        }

        revalidatePath("/admin/sharing-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteSharingRule(ruleId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.sharingRule.findUnique({
            where: { id: ruleId },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Sharing rule not found." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.SHARING_RULE, ruleId);
            await tx.sharingRule.delete({ where: { id: ruleId } });
        });

        await enqueueSharingRuleRecompute({
            organizationId,
            objectDefId: rule.objectDefId,
        });

        revalidatePath("/admin/sharing-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function toggleSharingRule(ruleId: number, isActive: boolean) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.sharingRule.findUnique({
            where: { id: ruleId },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Sharing rule not found." };
        }

        await db.sharingRule.update({
            where: { id: ruleId },
            data: { isActive },
        });

        await enqueueSharingRuleRecompute({
            organizationId,
            objectDefId: rule.objectDefId,
        });

        revalidatePath("/admin/sharing-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function reorderSharingRules(objectDefId: number, ruleIds: number[]) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rules = await db.sharingRule.findMany({
            where: {
                organizationId,
                objectDefId,
                id: { in: ruleIds },
            },
            select: { id: true },
        });

        if (rules.length !== ruleIds.length) {
            return { success: false, error: "Some rules were not found." };
        }

        await db.$transaction(async (tx) => {
            for (let i = 0; i < ruleIds.length; i += 1) {
                await tx.sharingRule.update({
                    where: { id: ruleIds[i] },
                    data: { sortOrder: i },
                });
            }
        });

        revalidatePath("/admin/sharing-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
