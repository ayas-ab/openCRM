"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    removeDependenciesForSource,
    syncAssignmentRuleDependencies,
} from "@/lib/metadata-dependencies";
import { AssignmentTargetType, MetadataDependencySourceType } from "@prisma/client";
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
        logic: z.enum(["ALL", "ANY"]).optional(),
        filters: z.array(criteriaFilterSchema).optional(),
    })
    .optional();

const assignmentRuleSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().optional(),
    targetType: z.enum(["USER", "QUEUE"]),
    targetUserId: z.number().optional().nullable(),
    targetQueueId: z.number().optional().nullable(),
    criteria: criteriaSchema,
});

const UNSUPPORTED_CRITERIA_TYPES = new Set(["TextArea", "File"]);
const PICKLIST_ALLOWED_OPERATORS = new Set(["equals", "not_equals", "is_blank", "is_not_blank"]);

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
            throw new Error("TextArea and File fields cannot be used in assignment criteria.");
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

export async function createAssignmentRule(data: z.infer<typeof assignmentRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = assignmentRuleSchema.parse(data);

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: payload.objectDefId, organizationId },
        });
        if (!objectDef) return { success: false, error: "Object not found." };
        if (objectDef.apiName === USER_OBJECT_API_NAME) {
            return { success: false, error: "Assignment rules are not supported for the User object." };
        }

        await validateCriteriaFields(organizationId, payload.objectDefId, payload.criteria);

        if (payload.targetType === "USER") {
            if (!payload.targetUserId) {
                return { success: false, error: "Select a target user." };
            }
            const user = await db.user.findUnique({
                where: { id: payload.targetUserId, organizationId },
            });
            if (!user) return { success: false, error: "Target user not found." };
        } else {
            if (!payload.targetQueueId) {
                return { success: false, error: "Select a target queue." };
            }
            const queue = await db.queue.findUnique({
                where: { id: payload.targetQueueId, organizationId },
            });
            if (!queue) return { success: false, error: "Target queue not found." };
        }

        const lastRule = await db.assignmentRule.findFirst({
            where: { organizationId, objectDefId: payload.objectDefId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });
        const nextSortOrder = payload.sortOrder ?? (lastRule?.sortOrder ?? 0) + 1;

        const created = await db.assignmentRule.create({
            data: {
                organizationId,
                objectDefId: payload.objectDefId,
                name: payload.name,
                description: payload.description,
                isActive: payload.isActive,
                sortOrder: nextSortOrder,
                targetType: payload.targetType === "USER" ? AssignmentTargetType.USER : AssignmentTargetType.QUEUE,
                targetUserId: payload.targetType === "USER" ? payload.targetUserId : null,
                targetQueueId: payload.targetType === "QUEUE" ? payload.targetQueueId : null,
                criteria: payload.criteria ?? {},
            },
        });

        await syncAssignmentRuleDependencies(db, created.id, organizationId);

        revalidatePath("/admin/assignment-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateAssignmentRule(ruleId: number, data: z.infer<typeof assignmentRuleSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const payload = assignmentRuleSchema.parse(data);

        const rule = await db.assignmentRule.findUnique({
            where: { id: ruleId },
            include: { objectDef: true },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Assignment rule not found." };
        }
        if (rule.objectDef.apiName === USER_OBJECT_API_NAME) {
            return { success: false, error: "Assignment rules are not supported for the User object." };
        }

        await validateCriteriaFields(organizationId, payload.objectDefId, payload.criteria);

        if (payload.targetType === "USER") {
            if (!payload.targetUserId) {
                return { success: false, error: "Select a target user." };
            }
            const user = await db.user.findUnique({
                where: { id: payload.targetUserId, organizationId },
            });
            if (!user) return { success: false, error: "Target user not found." };
        } else {
            if (!payload.targetQueueId) {
                return { success: false, error: "Select a target queue." };
            }
            const queue = await db.queue.findUnique({
                where: { id: payload.targetQueueId, organizationId },
            });
            if (!queue) return { success: false, error: "Target queue not found." };
        }

        await db.assignmentRule.update({
            where: { id: ruleId },
            data: {
                name: payload.name,
                description: payload.description,
                isActive: payload.isActive,
                sortOrder: payload.sortOrder ?? rule.sortOrder,
                targetType: payload.targetType === "USER" ? AssignmentTargetType.USER : AssignmentTargetType.QUEUE,
                targetUserId: payload.targetType === "USER" ? payload.targetUserId : null,
                targetQueueId: payload.targetType === "QUEUE" ? payload.targetQueueId : null,
                criteria: payload.criteria ?? {},
            },
        });

        await syncAssignmentRuleDependencies(db, ruleId, organizationId);

        revalidatePath("/admin/assignment-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteAssignmentRule(ruleId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.assignmentRule.findUnique({
            where: { id: ruleId },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Assignment rule not found." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.ASSIGNMENT_RULE, ruleId);
            await tx.assignmentRule.delete({ where: { id: ruleId } });
        });
        revalidatePath("/admin/assignment-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function toggleAssignmentRule(ruleId: number, isActive: boolean) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rule = await db.assignmentRule.findUnique({
            where: { id: ruleId },
        });
        if (!rule || rule.organizationId !== organizationId) {
            return { success: false, error: "Assignment rule not found." };
        }

        await db.assignmentRule.update({
            where: { id: ruleId },
            data: { isActive },
        });

        revalidatePath("/admin/assignment-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function reorderAssignmentRules(objectDefId: number, ruleIds: number[]) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const rules = await db.assignmentRule.findMany({
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
                await tx.assignmentRule.update({
                    where: { id: ruleIds[i] },
                    data: { sortOrder: i },
                });
            }
        });

        revalidatePath("/admin/assignment-rules");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
