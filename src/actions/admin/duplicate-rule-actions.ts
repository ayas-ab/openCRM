"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    removeDependenciesForSource,
    syncDuplicateRuleDependencies,
} from "@/lib/metadata-dependencies";
import { normalizeCustomLogicExpressionOrThrow } from "@/lib/validation/rule-logic";
import { MetadataDependencySourceType, DuplicateRuleAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

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
        organizationId: parseInt(user.organizationId),
        userType: user.userType,
    };
}

const duplicateRuleSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().optional(),
    createAction: z.enum(["NONE", "WARN", "BLOCK"]),
    editAction: z.enum(["NONE", "WARN", "BLOCK"]),
    logicOperator: z.enum(["ALL", "ANY", "CUSTOM"]),
    logicExpression: z.string().optional(),
    fieldDefIds: z.array(z.number()).min(2, "Choose at least two fields."),
});

async function validateRuleFields(organizationId: number, objectDefId: number, fieldDefIds: number[]) {
    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId },
        select: { id: true, apiName: true },
    });
    if (!objectDef) {
        throw new Error("Object not found.");
    }
    if (objectDef.apiName === USER_OBJECT_API_NAME) {
        throw new Error("Duplicate rules are not supported for the User object.");
    }

    const uniqueFieldDefIds = Array.from(new Set(fieldDefIds));
    if (uniqueFieldDefIds.length < 2) {
        throw new Error("Choose at least two distinct fields.");
    }

    const fields = await db.fieldDefinition.findMany({
        where: {
            id: { in: uniqueFieldDefIds },
            objectDefId,
            objectDef: { organizationId },
        },
        select: { id: true, type: true },
    });

    if (fields.length !== uniqueFieldDefIds.length) {
        throw new Error("One or more fields are invalid.");
    }

    const unsupported = new Set(["TextArea", "File", "Checkbox", "AutoNumber"]);
    const invalidField = fields.find((field) => unsupported.has(field.type));
    if (invalidField) {
        throw new Error("TextArea, File, Checkbox, and AutoNumber fields cannot be used in duplicate rules.");
    }

    return uniqueFieldDefIds;
}

function toAction(value: "NONE" | "WARN" | "BLOCK") {
    return value === "BLOCK" ? DuplicateRuleAction.BLOCK : value === "WARN" ? DuplicateRuleAction.WARN : DuplicateRuleAction.NONE;
}

export async function createDuplicateRule(data: z.infer<typeof duplicateRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = duplicateRuleSchema.parse(data);
        const fieldDefIds = await validateRuleFields(organizationId, payload.objectDefId, payload.fieldDefIds);
        const logicExpression =
            payload.logicOperator === "CUSTOM"
                ? normalizeCustomLogicExpressionOrThrow(payload.logicExpression, fieldDefIds.length)
                : null;

        const lastRule = await db.duplicateRule.findFirst({
            where: { organizationId, objectDefId: payload.objectDefId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });
        const nextSortOrder = payload.sortOrder ?? (lastRule?.sortOrder ?? 0) + 1;

        const created = await db.$transaction(async (tx) => {
            const rule = await tx.duplicateRule.create({
                data: {
                    organizationId,
                    objectDefId: payload.objectDefId,
                    name: payload.name.trim(),
                    description: payload.description?.trim() || null,
                    isActive: payload.isActive,
                    sortOrder: nextSortOrder,
                    createAction: toAction(payload.createAction),
                    editAction: toAction(payload.editAction),
                    logicOperator: payload.logicOperator,
                    logicExpression,
                },
            });

            await tx.duplicateRuleCondition.createMany({
                data: fieldDefIds.map((fieldDefId, index) => ({
                    ruleId: rule.id,
                    fieldDefId,
                    sortOrder: index,
                })),
            });

            await syncDuplicateRuleDependencies(tx, rule.id, organizationId);
            return rule;
        });

        revalidatePath("/admin/duplicate-rules");
        revalidatePath(`/admin/duplicate-rules/${payload.objectDefId}`);
        return { success: true, data: created };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateDuplicateRule(ruleId: number, data: z.infer<typeof duplicateRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = duplicateRuleSchema.parse(data);
        const existing = await db.duplicateRule.findFirst({
            where: { id: ruleId, organizationId },
            select: { id: true, objectDefId: true, sortOrder: true },
        });
        if (!existing) {
            return { success: false, error: "Duplicate rule not found." };
        }

        const fieldDefIds = await validateRuleFields(organizationId, payload.objectDefId, payload.fieldDefIds);
        const logicExpression =
            payload.logicOperator === "CUSTOM"
                ? normalizeCustomLogicExpressionOrThrow(payload.logicExpression, fieldDefIds.length)
                : null;

        await db.$transaction(async (tx) => {
            await tx.duplicateRule.update({
                where: { id: ruleId },
                data: {
                    name: payload.name.trim(),
                    description: payload.description?.trim() || null,
                    isActive: payload.isActive,
                    sortOrder: payload.sortOrder ?? existing.sortOrder,
                    createAction: toAction(payload.createAction),
                    editAction: toAction(payload.editAction),
                    logicOperator: payload.logicOperator,
                    logicExpression,
                },
            });

            await tx.duplicateRuleCondition.deleteMany({
                where: { ruleId },
            });

            await tx.duplicateRuleCondition.createMany({
                data: fieldDefIds.map((fieldDefId, index) => ({
                    ruleId,
                    fieldDefId,
                    sortOrder: index,
                })),
            });

            await syncDuplicateRuleDependencies(tx, ruleId, organizationId);
        });

        revalidatePath("/admin/duplicate-rules");
        revalidatePath(`/admin/duplicate-rules/${existing.objectDefId}`);
        if (payload.objectDefId !== existing.objectDefId) {
            revalidatePath(`/admin/duplicate-rules/${payload.objectDefId}`);
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteDuplicateRule(ruleId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.duplicateRule.findFirst({
            where: { id: ruleId, organizationId },
            select: { id: true, objectDefId: true },
        });
        if (!rule) {
            return { success: false, error: "Duplicate rule not found." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.DUPLICATE_RULE, ruleId);
            await tx.duplicateRule.delete({ where: { id: ruleId } });
        });

        revalidatePath("/admin/duplicate-rules");
        revalidatePath(`/admin/duplicate-rules/${rule.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function toggleDuplicateRule(ruleId: number, isActive: boolean) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.duplicateRule.findFirst({
            where: { id: ruleId, organizationId },
            select: { id: true, objectDefId: true },
        });
        if (!rule) {
            return { success: false, error: "Duplicate rule not found." };
        }

        await db.duplicateRule.update({
            where: { id: ruleId },
            data: { isActive },
        });

        revalidatePath("/admin/duplicate-rules");
        revalidatePath(`/admin/duplicate-rules/${rule.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function reorderDuplicateRules(objectDefId: number, ruleIds: number[]) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rules = await db.duplicateRule.findMany({
            where: {
                organizationId,
                objectDefId,
                id: { in: ruleIds },
            },
            select: { id: true },
        });
        if (rules.length !== ruleIds.length) {
            return { success: false, error: "Some duplicate rules were not found." };
        }

        await db.$transaction(async (tx) => {
            for (let i = 0; i < ruleIds.length; i += 1) {
                await tx.duplicateRule.update({
                    where: { id: ruleIds[i] },
                    data: { sortOrder: i },
                });
            }
        });

        revalidatePath(`/admin/duplicate-rules/${objectDefId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
