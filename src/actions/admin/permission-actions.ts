"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

function sanitizeUserObjectPermissions<T extends {
    allowRead: boolean;
    allowCreate: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    allowViewAll: boolean;
    allowModifyAll: boolean;
    allowModifyListViews: boolean;
}>(objectApiName: string, permissions: T): T {
    if (objectApiName !== USER_OBJECT_API_NAME) {
        return permissions;
    }

    return {
        ...permissions,
        allowCreate: false,
        allowEdit: false,
        allowDelete: false,
        allowModifyAll: false,
    };
}

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

const createPermissionSetSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
});

export async function createPermissionSet(data: z.infer<typeof createPermissionSetSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = createPermissionSetSchema.parse(data);

        await db.permissionSet.create({
            data: {
                organizationId,
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath("/admin/permissions");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A permission set with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function updateObjectPermission(
    permissionSetId: number,
    objectDefId: number,
    permissions: {
        allowRead: boolean;
        allowCreate: boolean;
        allowEdit: boolean;
        allowDelete: boolean;
        allowViewAll: boolean;
        allowModifyAll: boolean;
        allowModifyListViews: boolean;
    }
) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        // Verify permission set belongs to org
        const permSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
        });
        if (!permSet) throw new Error("Permission Set not found");

        const objectDef = await db.objectDefinition.findFirst({
            where: { id: objectDefId, organizationId },
            select: { id: true, apiName: true },
        });
        if (!objectDef) throw new Error("Object not found");

        const nextPermissions = sanitizeUserObjectPermissions(objectDef.apiName, permissions);

        await db.objectPermission.upsert({
            where: {
                permissionSetId_objectDefId: {
                    permissionSetId,
                    objectDefId,
                },
            },
            create: {
                permissionSetId,
                objectDefId,
                ...nextPermissions,
            },
            update: nextPermissions,
        });

        revalidatePath(`/admin/permissions/${permissionSetId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function togglePermission(
    permissionSetId: number,
    objectDefId: number,
    field: string,
    value: boolean
) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        // Verify permission set
        const permSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
        });
        if (!permSet) throw new Error("Permission Set not found");

        const objectDef = await db.objectDefinition.findFirst({
            where: { id: objectDefId, organizationId },
            select: { id: true, apiName: true },
        });
        if (!objectDef) throw new Error("Object not found");

        // Find existing permission or create default
        const existing = await db.objectPermission.findUnique({
            where: {
                permissionSetId_objectDefId: {
                    permissionSetId,
                    objectDefId,
                },
            },
        });

        const data: any = existing || {
            permissionSetId,
            objectDefId,
            allowRead: false,
            allowCreate: false,
            allowEdit: false,
            allowDelete: false,
            allowViewAll: false,
            allowModifyAll: false,
            allowModifyListViews: false,
        };

        // Update the specific field
        data[field] = value;
        const nextData = sanitizeUserObjectPermissions(objectDef.apiName, data);

        // Remove ID if it exists (from existing) to avoid error on create
        delete nextData.id;

        await db.objectPermission.upsert({
            where: {
                permissionSetId_objectDefId: {
                    permissionSetId,
                    objectDefId,
                },
            },
            create: nextData,
            update: nextData,
        });

        revalidatePath(`/admin/permissions/${permissionSetId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

const createPermissionSetGroupSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
});

export async function createPermissionSetGroup(data: z.infer<typeof createPermissionSetGroupSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = createPermissionSetGroupSchema.parse(data);

        await db.permissionSetGroup.create({
            data: {
                organizationId,
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath("/admin/permission-groups");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A group with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function addPermissionSetToGroup(groupId: number, permissionSetId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const group = await db.permissionSetGroup.findFirst({
            where: { id: groupId, organizationId },
            select: { id: true },
        });
        if (!group) throw new Error("Permission set group not found");

        const permissionSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
            select: { id: true },
        });
        if (!permissionSet) throw new Error("Permission Set not found");

        await db.$transaction(async (tx) => {
            await tx.permissionSetGroupMember.create({
                data: {
                    permissionSetGroupId: groupId,
                    permissionSetId: permissionSetId,
                },
            });

            const memberUsers = await tx.permissionSetGroupAssignment.findMany({
                where: { permissionSetGroupId: groupId },
                select: { userId: true },
            });

            if (memberUsers.length > 0) {
                const assignments = await Promise.all(
                    memberUsers.map((member) =>
                        tx.permissionSetAssignment.upsert({
                            where: {
                                userId_permissionSetId: {
                                    userId: member.userId,
                                    permissionSetId,
                                },
                            },
                            create: {
                                userId: member.userId,
                                permissionSetId,
                            },
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

        revalidatePath(`/admin/permission-groups/${groupId}`);
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "This permission set is already in the group." };
        }
        return { success: false, error: error.message };
    }
}

export async function removePermissionSetFromGroup(groupId: number, permissionSetId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const group = await db.permissionSetGroup.findFirst({
            where: { id: groupId, organizationId },
            select: { id: true },
        });
        if (!group) throw new Error("Permission set group not found");

        const permissionSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
            select: { id: true },
        });
        if (!permissionSet) throw new Error("Permission Set not found");

        await db.$transaction(async (tx) => {
            await tx.permissionSetGroupMember.deleteMany({
                where: {
                    permissionSetGroupId: groupId,
                    permissionSetId: permissionSetId,
                },
            });

            await tx.permissionSetAssignmentSource.deleteMany({
                where: {
                    sourceType: "GROUP",
                    permissionSetGroupId: groupId,
                    assignment: {
                        permissionSetId,
                        user: { organizationId },
                    },
                },
            });

            await tx.permissionSetAssignment.deleteMany({
                where: {
                    permissionSetId,
                    user: { organizationId },
                    sources: { none: {} },
                },
            });
        });

        revalidatePath(`/admin/permission-groups/${groupId}`);
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deletePermissionSetGroup(groupId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const group = await db.permissionSetGroup.findFirst({
            where: { id: groupId, organizationId },
            select: { id: true },
        });

        if (!group) {
            return { success: false, error: "Permission set group not found." };
        }

        await db.$transaction(async (tx) => {
            await tx.permissionSetAssignmentSource.deleteMany({
                where: {
                    sourceType: "GROUP",
                    permissionSetGroupId: groupId,
                },
            });

            await tx.permissionSetAssignment.deleteMany({
                where: {
                    user: { organizationId },
                    sources: { none: {} },
                },
            });

            await tx.permissionSetGroupAssignment.deleteMany({
                where: { permissionSetGroupId: groupId },
            });

            await tx.permissionSetGroupMember.deleteMany({
                where: { permissionSetGroupId: groupId },
            });

            await tx.permissionSetGroup.delete({
                where: { id: groupId },
            });
        });

        revalidatePath("/admin/permission-groups");
        revalidatePath(`/admin/permission-groups/${groupId}`);
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeUserFromPermissionSetGroup(groupId: number, userId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const group = await db.permissionSetGroup.findFirst({
            where: { id: groupId, organizationId },
            select: { id: true },
        });

        if (!group) {
            return { success: false, error: "Permission set group not found." };
        }

        await db.$transaction(async (tx) => {
            await tx.permissionSetGroupAssignment.deleteMany({
                where: {
                    permissionSetGroupId: groupId,
                    userId,
                    user: { organizationId },
                },
            });

            await tx.permissionSetAssignmentSource.deleteMany({
                where: {
                    sourceType: "GROUP",
                    permissionSetGroupId: groupId,
                    assignment: {
                        userId,
                        user: { organizationId },
                    },
                },
            });

            await tx.permissionSetAssignment.deleteMany({
                where: {
                    userId,
                    user: { organizationId },
                    sources: { none: {} },
                },
            });
        });

        revalidatePath(`/admin/permission-groups/${groupId}`);
        revalidatePath(`/admin/users/${userId}`);
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function toggleAppPermission(permissionSetId: number, appId: number, hasAccess: boolean) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const permissionSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
            select: { id: true },
        });
        if (!permissionSet) throw new Error("Permission Set not found");

        const app = await db.appDefinition.findFirst({
            where: { id: appId, organizationId },
            select: { id: true },
        });
        if (!app) throw new Error("App not found");

        if (hasAccess) {
            // Grant Access
            await db.appPermission.create({
                data: {
                    permissionSetId,
                    appId,
                },
            });
        } else {
            // Revoke Access
            await db.appPermission.deleteMany({
                where: {
                    permissionSetId,
                    appId,
                },
            });
        }

        revalidatePath(`/admin/permissions/${permissionSetId}`);
        return { success: true };
    } catch (error: any) {
        // Ignore duplicate errors if creating existing
        if (error.code === "P2002") return { success: true };
        return { success: false, error: error.message };
    }
}

export async function toggleSystemPermission(
    permissionSetId: number,
    field: "allowDataLoading",
    value: boolean
) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const permissionSet = await db.permissionSet.findFirst({
            where: { id: permissionSetId, organizationId },
            select: { id: true },
        });
        if (!permissionSet) throw new Error("Permission Set not found");

        await db.permissionSet.update({
            where: { id: permissionSetId },
            data: { [field]: value },
        });

        revalidatePath(`/admin/permissions/${permissionSetId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
