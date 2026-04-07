"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { buildFieldDataPayload, getFieldDisplayValue } from "@/lib/field-data";
import { enqueueSharingRuleRecompute } from "@/lib/jobs/sharing-rule-jobs";
import { getUserPermissionSetIds } from "@/lib/permissions";
import { normalizeStoredUniqueValue, normalizeUniqueValue } from "@/lib/unique";
import { validateRecordData } from "@/lib/validation/record-validation";
import {
    OwnerType,
    UserType,
    type ValidationCondition,
    type ValidationRule,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
    ensureUserCompanionRecord,
    USER_ID_FIELD_API_NAME,
    USER_OBJECT_API_NAME,
} from "@/lib/user-companion";
import {
    characterLengthOperators,
    coerceFieldValue,
    evaluateCustomLogicExpression,
    evaluateOperator,
} from "@/lib/validation/rule-logic";

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

async function enqueueSharingRecomputeForOrg(organizationId: number) {
    const rules = await db.sharingRule.findMany({
        where: { organizationId, isActive: true },
        select: { objectDefId: true },
    });
    const objectDefIds = Array.from(new Set(rules.map((rule) => rule.objectDefId)));
    await Promise.all(
        objectDefIds.map((objectDefId) =>
            enqueueSharingRuleRecompute({ organizationId, objectDefId })
        )
    );
}

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

    let leftValue = valueMap[condition.fieldDef.apiName];
    let rightValue: any = null;
    const operator = condition.operator;
    const isCharacterLength = characterLengthOperators.has(operator);

    if (operator === "is_blank") {
        return leftValue === null || leftValue === undefined || leftValue === "";
    }
    if (operator === "is_not_blank") {
        return !(leftValue === null || leftValue === undefined || leftValue === "");
    }

    if (condition.compareSource === "field") {
        if (isCharacterLength) return false;
        if (!condition.compareField?.apiName) return false;
        rightValue = coerceFieldValue(condition.compareField.type, valueMap[condition.compareField.apiName]);
    } else {
        rightValue = isCharacterLength
            ? condition.compareValue
            : coerceFieldValue(condition.fieldDef.type, condition.compareValue);
    }

    leftValue = isCharacterLength ? leftValue : coerceFieldValue(condition.fieldDef.type, leftValue);

    if (numericOperators.has(operator)) {
        if (typeof leftValue !== "number" || typeof rightValue !== "number") return false;
    } else if (stringOnlyOperators.has(operator)) {
        if (!textFieldTypes.has(condition.fieldDef.type)) return false;
        leftValue = leftValue == null ? "" : String(leftValue);
        rightValue = rightValue == null ? "" : String(rightValue);
    }

    return evaluateOperator(leftValue, rightValue, operator);
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
            shouldTrigger = customResult ?? false;
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

const inviteUserSchema = z.object({
    name: z.string().min(1, "Name is required"),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-z0-9]+$/, "Username must be lowercase letters and numbers only")
        .transform((value) => value.toLowerCase()),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    userType: z.enum(["standard", "admin"]),
});

const managedUserAccountSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-z0-9]+$/, "Username must be lowercase letters and numbers only")
        .transform((value) => value.toLowerCase()),
    email: z
        .string()
        .trim()
        .optional()
        .transform((value) => value ?? "")
        .refine((value) => value === "" || z.string().email().safeParse(value).success, "Invalid email address")
        .transform((value) => (value === "" ? null : value)),
    userType: z.enum(["standard", "admin"]),
    groupId: z.number().int().positive().nullable(),
});

const managedUserProfileSchema = z.object({
    account: managedUserAccountSchema,
    recordData: z.record(z.string(), z.any()),
});

function formatZodFieldErrors(error: z.ZodError) {
    const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
    return Object.fromEntries(
        Object.entries(flattened)
            .map(([key, messages]) => [key, messages?.[0]])
            .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    );
}

export async function inviteUser(data: z.infer<typeof inviteUserSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = inviteUserSchema.parse(data);
        const hashedPassword = await bcrypt.hash(validated.password, 10);

        const existingEmail = await db.user.findFirst({
            where: { organizationId, email: validated.email },
            select: { id: true },
        });
        if (existingEmail) {
            return { success: false, error: "This email is already used in this organization." };
        }

        await db.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    organizationId,
                    name: validated.name,
                    username: validated.username,
                    email: validated.email,
                    password: hashedPassword,
                    userType: validated.userType === "admin" ? UserType.admin : UserType.standard,
                },
            });

            await ensureUserCompanionRecord(tx, organizationId, user.id);
        });

        revalidatePath("/admin/users");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            const target = error.meta?.target;
            if (typeof target === "string" && target.includes("username")) {
                return { success: false, error: "This username is already taken." };
            }
            if (Array.isArray(target) && target.includes("username")) {
                return { success: false, error: "This username is already taken." };
            }
            if (typeof target === "string" && target.includes("email")) {
                return { success: false, error: "This email is already used in this organization." };
            }
            if (Array.isArray(target) && target.includes("email")) {
                return { success: false, error: "This email is already used in this organization." };
            }
            return { success: false, error: "A user with this information already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function assignPermissionSet(userId: number, permissionSetId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const targetUser = await db.user.findFirst({
            where: { id: userId, organizationId },
            select: { id: true },
        });
        if (!targetUser) {
            return { success: false, error: "User not found." };
        }

        const permissionSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
            select: { id: true },
        });
        if (!permissionSet) {
            return { success: false, error: "Permission set not found." };
        }

        const assignment = await db.permissionSetAssignment.upsert({
            where: {
                userId_permissionSetId: {
                    userId,
                    permissionSetId,
                },
            },
            create: {
                userId,
                permissionSetId,
            },
            update: {},
            select: { id: true },
        });

        const existingDirectSource = await db.permissionSetAssignmentSource.findFirst({
            where: {
                assignmentId: assignment.id,
                sourceType: "DIRECT",
                permissionSetGroupId: null,
            },
            select: { id: true },
        });

        if (!existingDirectSource) {
            await db.permissionSetAssignmentSource.create({
                data: {
                    assignmentId: assignment.id,
                    sourceType: "DIRECT",
                },
            });
        }

        revalidatePath(`/admin/users/${userId}`);
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "This permission set is already assigned." };
        }
        return { success: false, error: error.message };
    }
}

export async function removePermissionAssignment(userId: number, permissionSetId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const assignment = await db.permissionSetAssignment.findFirst({
            where: {
                userId,
                permissionSetId,
                user: { organizationId },
            },
            include: {
                sources: true,
            },
        });

        if (!assignment) {
            return { success: false, error: "Assignment not found." };
        }

        const hasDirectSource = assignment.sources.some((source) => source.sourceType === "DIRECT");
        if (!hasDirectSource) {
            return { success: false, error: "This permission set is managed by a group." };
        }

        await db.$transaction(async (tx) => {
            await tx.permissionSetAssignmentSource.deleteMany({
                where: {
                    assignmentId: assignment.id,
                    sourceType: "DIRECT",
                },
            });

            const remainingSources = await tx.permissionSetAssignmentSource.count({
                where: { assignmentId: assignment.id },
            });

            if (remainingSources === 0) {
                await tx.permissionSetAssignment.delete({
                    where: { id: assignment.id },
                });
            }
        });

        revalidatePath(`/admin/users/${userId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Assign all Permission Sets from a Permission Set Group to a user.
 * This "explodes" the group into individual assignments.
 */
export async function assignPermissionSetGroup(userId: number, groupId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const targetUser = await db.user.findFirst({
            where: { id: userId, organizationId },
            select: { id: true },
        });
        if (!targetUser) {
            return { success: false, error: "User not found." };
        }

        const group = await db.permissionSetGroup.findFirst({
            where: { id: groupId, organizationId },
            select: { id: true },
        });

        if (!group) {
            return { success: false, error: "Permission set group not found." };
        }

        const existingMembership = await db.permissionSetGroupAssignment.findFirst({
            where: { permissionSetGroupId: groupId, userId, user: { organizationId } },
            select: { id: true },
        });

        if (existingMembership) {
            return { success: false, error: "User is already assigned to this group." };
        }

        // Find all Permission Sets in the Group
        const groupMembers = await db.permissionSetGroupMember.findMany({
            where: { permissionSetGroupId: groupId },
            select: { permissionSetId: true },
        });

        const permissionSetIds = groupMembers.map((member) => member.permissionSetId);

        await db.$transaction(async (tx) => {
            await tx.permissionSetGroupAssignment.create({
                data: {
                    permissionSetGroupId: groupId,
                    userId,
                },
            });

            if (permissionSetIds.length > 0) {
                const assignments = await Promise.all(
                    permissionSetIds.map((permissionSetId) =>
                        tx.permissionSetAssignment.upsert({
                            where: {
                                userId_permissionSetId: {
                                    userId,
                                    permissionSetId,
                                },
                            },
                            create: { userId, permissionSetId },
                            update: {},
                            select: { id: true },
                        })
                    )
                );

                await tx.permissionSetAssignmentSource.createMany({
                    data: assignments.map((assignment) => ({
                        assignmentId: assignment.id,
                        sourceType: "GROUP",
                        permissionSetGroupId: groupId,
                    })),
                    skipDuplicates: true,
                });
            }
        });

        revalidatePath(`/admin/users/${userId}`);
        return { success: true, assignedCount: permissionSetIds.length };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateManagedUserAccount(
    userId: number,
    data: z.infer<typeof managedUserAccountSchema>
) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = managedUserAccountSchema.parse(data);

        const existingUser = await db.user.findFirst({
            where: { id: userId, organizationId },
            select: { id: true, groupId: true },
        });
        if (!existingUser) {
            return { success: false, error: "User not found." };
        }

        if (validated.groupId !== null) {
            const group = await db.group.findFirst({
                where: { id: validated.groupId, organizationId },
                select: { id: true },
            });
            if (!group) {
                return { success: false, error: "Group not found." };
            }
        }

        await db.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    name: validated.name,
                    username: validated.username,
                    email: validated.email,
                    userType: validated.userType === "admin" ? UserType.admin : UserType.standard,
                    groupId: validated.groupId,
                },
            });

            await ensureUserCompanionRecord(tx, organizationId, userId);
        });

        if (existingUser.groupId !== validated.groupId) {
            await enqueueSharingRecomputeForOrg(organizationId);
        }

        revalidatePath(`/admin/users/${userId}`);
        revalidatePath("/admin/users");
        revalidatePath("/app");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            const target = error.meta?.target;
            if (typeof target === "string" && target.includes("username")) {
                return { success: false, error: "This username is already taken." };
            }
            if (Array.isArray(target) && target.includes("username")) {
                return { success: false, error: "This username is already taken." };
            }
            if (typeof target === "string" && target.includes("email")) {
                return { success: false, error: "This email is already used in this organization." };
            }
            if (Array.isArray(target) && target.includes("email")) {
                return { success: false, error: "This email is already used in this organization." };
            }
            return { success: false, error: "A user with this information already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function updateManagedUserProfile(
    userId: number,
    data: z.infer<typeof managedUserProfileSchema>
) {
    try {
        const { userId: actingUserId, organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = managedUserProfileSchema.safeParse(data);
        if (!validated.success) {
            return {
                success: false,
                error: JSON.stringify(
                    Object.fromEntries(
                        Object.entries(formatZodFieldErrors(validated.error)).map(([key, value]) => [`account${key[0].toUpperCase()}${key.slice(1)}`, value])
                    )
                ),
            };
        }

        const { account, recordData } = validated.data;
        const permissionSetIds = await getUserPermissionSetIds(actingUserId);

        const [existingUser, record] = await Promise.all([
            db.user.findFirst({
                where: { id: userId, organizationId },
                select: { id: true, groupId: true },
            }),
            db.record.findFirst({
                where: {
                    organizationId,
                    backingUserId: userId,
                    objectDef: { apiName: USER_OBJECT_API_NAME },
                },
                include: {
                    objectDef: {
                        include: {
                            fields: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                                orderBy: { createdAt: "asc" },
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
            }),
        ]);

        if (!existingUser) {
            return { success: false, error: "User not found." };
        }

        if (!record) {
            return { success: false, error: "User record not found." };
        }

        if (account.groupId !== null) {
            const group = await db.group.findFirst({
                where: { id: account.groupId, organizationId },
                select: { id: true },
            });
            if (!group) {
                return {
                    success: false,
                    error: JSON.stringify({ accountGroupId: "Group not found." }),
                };
            }
        }

        const disallowedKeys = ["ownerId", "ownerQueueId", "name", USER_ID_FIELD_API_NAME];
        const invalidKey = Object.keys(recordData).find((key) => disallowedKeys.includes(key));
        if (invalidKey) {
            return { success: false, error: `${invalidKey} cannot be edited here.` };
        }

        const editableFields = record.objectDef.fields.filter(
            (field: any) => field.apiName !== "name" && field.apiName !== USER_ID_FIELD_API_NAME
        );

        try {
            validateRecordData(editableFields, recordData);
            await enforceUniqueFields(record.objectDef, recordData, record.id);
            await validateLookupValues(editableFields, recordData, organizationId);
        } catch (error: any) {
            return { success: false, error: error.message };
        }

        const valueMap = buildValueMap(
            record.objectDef.fields,
            recordData,
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

        await db.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    name: account.name,
                    username: account.username,
                    email: account.email,
                    userType: account.userType === "admin" ? UserType.admin : UserType.standard,
                    groupId: account.groupId,
                },
            });

            await tx.record.update({
                where: { id: record.id },
                data: {
                    lastModifiedById: actingUserId,
                    ownerId: userId,
                    ownerType: OwnerType.USER,
                    ownerQueueId: null,
                    backingUserId: userId,
                },
            });

            for (const field of editableFields) {
                if (field.type === "File" || field.type === "AutoNumber") {
                    continue;
                }
                if (!Object.prototype.hasOwnProperty.call(recordData, field.apiName)) continue;

                const payload = buildFieldDataPayload(field, recordData[field.apiName]);
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

        if (existingUser.groupId !== account.groupId) {
            await enqueueSharingRecomputeForOrg(organizationId);
        }

        revalidatePath(`/admin/users/${userId}`);
        revalidatePath("/admin/users");
        revalidatePath("/app");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            const target = error.meta?.target;
            if (typeof target === "string" && target.includes("username")) {
                return { success: false, error: JSON.stringify({ accountUsername: "This username is already taken." }) };
            }
            if (Array.isArray(target) && target.includes("username")) {
                return { success: false, error: JSON.stringify({ accountUsername: "This username is already taken." }) };
            }
            if (typeof target === "string" && target.includes("email")) {
                return { success: false, error: JSON.stringify({ accountEmail: "This email is already used in this organization." }) };
            }
            if (Array.isArray(target) && target.includes("email")) {
                return { success: false, error: JSON.stringify({ accountEmail: "This email is already used in this organization." }) };
            }
            return { success: false, error: "A user with this information already exists." };
        }
        return { success: false, error: error.message || "Failed to update user profile." };
    }
}

export async function updateManagedUserRecord(userId: number, data: Record<string, any>) {
    try {
        const { userId: actingUserId, organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const permissionSetIds = await getUserPermissionSetIds(actingUserId);
        const record = await db.record.findFirst({
            where: {
                organizationId,
                backingUserId: userId,
                objectDef: { apiName: USER_OBJECT_API_NAME },
            },
            include: {
                objectDef: {
                    include: {
                        fields: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                            orderBy: { createdAt: "asc" },
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

        const disallowedKeys = ["ownerId", "ownerQueueId", "name", USER_ID_FIELD_API_NAME];
        const invalidKey = Object.keys(data).find((key) => disallowedKeys.includes(key));
        if (invalidKey) {
            return { success: false, error: `${invalidKey} cannot be edited here.` };
        }

        const editableFields = record.objectDef.fields.filter(
            (field: any) => field.apiName !== "name" && field.apiName !== USER_ID_FIELD_API_NAME
        );

        try {
            validateRecordData(editableFields, data);
            await enforceUniqueFields(record.objectDef, data, record.id);
            await validateLookupValues(editableFields, data, organizationId);
        } catch (error: any) {
            return { success: false, error: error.message };
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

        await db.$transaction(async (tx) => {
            await tx.record.update({
                where: { id: record.id },
                data: {
                    lastModifiedById: actingUserId,
                    ownerId: userId,
                    ownerType: OwnerType.USER,
                    ownerQueueId: null,
                    backingUserId: userId,
                },
            });

            for (const field of editableFields) {
                if (field.type === "File" || field.type === "AutoNumber") {
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

        revalidatePath(`/admin/users/${userId}`);
        revalidatePath("/admin/users");
        revalidatePath("/app");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to update user record." };
    }
}

