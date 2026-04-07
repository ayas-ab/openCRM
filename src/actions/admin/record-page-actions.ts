"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    removeDependenciesForSource,
    syncRecordPageLayoutDependencies,
} from "@/lib/metadata-dependencies";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    buildDefaultLayoutConfig,
    layoutConfigSchema,
    normalizeRecordPageLayoutConfig,
} from "@/lib/record-page-layout";
import { MetadataDependencySourceType } from "@prisma/client";

async function getUserContext() {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthorized");
    }
    const user = session.user as any;
    if (user.userType !== "admin") {
        throw new Error("Forbidden: Admin access required");
    }
    return { userId: parseInt(user.id), organizationId: parseInt(user.organizationId) };
}

const createLayoutSchema = z.object({
    objectDefId: z.number(),
    name: z.string().min(1),
    isDefault: z.boolean().optional(),
});

const updateLayoutSchema = z.object({
    layoutId: z.number(),
    name: z.string().min(1).optional(),
    config: layoutConfigSchema.optional(),
});

const assignmentSchema = z.object({
    objectDefId: z.number(),
    appId: z.number(),
    layoutId: z.number(),
    permissionSetId: z.number().nullable().optional(),
});

export async function createRecordPageLayout(payload: z.infer<typeof createLayoutSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const data = createLayoutSchema.parse(payload);

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: data.objectDefId, organizationId },
            include: { fields: { orderBy: { createdAt: "asc" } } },
        });

        if (!objectDef) {
            return { success: false, error: "Object not found." };
        }

        const config = buildDefaultLayoutConfig(
            objectDef.fields.map((field) => ({
                id: field.id,
                required: field.required,
                type: field.type,
            }))
        );

        const layout = await db.$transaction(async (tx) => {
            if (data.isDefault) {
                await tx.recordPageLayout.updateMany({
                    where: { objectDefId: objectDef.id, organizationId },
                    data: { isDefault: false },
                });
            }

            return tx.recordPageLayout.create({
                data: {
                    organizationId,
                    objectDefId: objectDef.id,
                    name: data.name,
                    isDefault: Boolean(data.isDefault),
                    config,
                },
            });
        });

        await syncRecordPageLayoutDependencies(db, layout.id, organizationId);

        revalidatePath(`/admin/objects/${objectDef.id}`);
        return { success: true, data: layout };
    } catch (error: any) {
        console.error("Create Record Page Layout Error:", error);
        return { success: false, error: error.message || "Failed to create layout" };
    }
}

export async function updateRecordPageLayout(payload: z.infer<typeof updateLayoutSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const data = updateLayoutSchema.parse(payload);

        const layout = await db.recordPageLayout.findUnique({
            where: { id: data.layoutId },
            include: {
                objectDef: {
                    include: { fields: true },
                },
            },
        });

        if (!layout || layout.organizationId !== organizationId) {
            return { success: false, error: "Layout not found." };
        }

        const nextConfig = normalizeRecordPageLayoutConfig(
            data.config ?? (layout.config as any),
            layout.objectDef.fields.map((field) => ({
                id: field.id,
                required: field.required,
                type: field.type,
            }))
        );

        await db.recordPageLayout.update({
            where: { id: layout.id },
            data: {
                name: data.name ?? layout.name,
                config: nextConfig,
            },
        });

        await syncRecordPageLayoutDependencies(db, layout.id, organizationId);

        revalidatePath(`/admin/objects/${layout.objectDefId}`);
        revalidatePath(`/admin/objects/${layout.objectDefId}/record-pages/${layout.id}`);
        return { success: true };
    } catch (error: any) {
        console.error("Update Record Page Layout Error:", error);
        return { success: false, error: error.message || "Failed to update layout" };
    }
}

export async function setDefaultRecordPageLayout(layoutId: number) {
    try {
        const { organizationId } = await getUserContext();

        const layout = await db.recordPageLayout.findUnique({
            where: { id: layoutId },
        });

        if (!layout || layout.organizationId !== organizationId) {
            return { success: false, error: "Layout not found." };
        }

        await db.$transaction(async (tx) => {
            await tx.recordPageLayout.updateMany({
                where: { objectDefId: layout.objectDefId, organizationId },
                data: { isDefault: false },
            });
            await tx.recordPageLayout.update({
                where: { id: layoutId },
                data: { isDefault: true },
            });
        });

        revalidatePath(`/admin/objects/${layout.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Set Default Layout Error:", error);
        return { success: false, error: error.message || "Failed to set default layout" };
    }
}

export async function createRecordPageAssignment(payload: z.infer<typeof assignmentSchema>) {
    try {
        const { organizationId } = await getUserContext();
        const data = assignmentSchema.parse(payload);

        const objectDef = await db.objectDefinition.findUnique({
            where: { id: data.objectDefId, organizationId },
        });

        if (!objectDef) {
            return { success: false, error: "Object not found." };
        }

        const app = await db.appDefinition.findUnique({
            where: { id: data.appId, organizationId },
        });

        if (!app) {
            return { success: false, error: "App not found." };
        }

        const layout = await db.recordPageLayout.findUnique({
            where: { id: data.layoutId },
        });

        if (!layout || layout.organizationId !== organizationId || layout.objectDefId !== objectDef.id) {
            return { success: false, error: "Layout not found." };
        }

        if (data.permissionSetId) {
            const permissionSet = await db.permissionSet.findUnique({
                where: { id: data.permissionSetId, organizationId },
            });
            if (!permissionSet) {
                return { success: false, error: "Permission set not found." };
            }
        }

        const existing = await db.recordPageAssignment.findFirst({
            where: {
                objectDefId: objectDef.id,
                appId: data.appId,
                permissionSetId: data.permissionSetId ?? null,
            },
        });

        if (existing) {
            return { success: false, error: "An assignment with the same conditions already exists." };
        }

        await db.recordPageAssignment.create({
            data: {
                organizationId,
                objectDefId: objectDef.id,
                appId: data.appId,
                layoutId: layout.id,
                permissionSetId: data.permissionSetId ?? null,
            },
        });

        revalidatePath(`/admin/objects/${objectDef.id}`);
        return { success: true };
    } catch (error: any) {
        console.error("Create Record Page Assignment Error:", error);
        return { success: false, error: error.message || "Failed to create assignment" };
    }
}

export async function deleteRecordPageAssignment(assignmentId: number) {
    try {
        const { organizationId } = await getUserContext();

        const assignment = await db.recordPageAssignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment || assignment.organizationId !== organizationId) {
            return { success: false, error: "Assignment not found." };
        }

        await db.recordPageAssignment.delete({
            where: { id: assignmentId },
        });

        revalidatePath(`/admin/objects/${assignment.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Record Page Assignment Error:", error);
        return { success: false, error: error.message || "Failed to delete assignment" };
    }
}

export async function deleteRecordPageLayout(layoutId: number) {
    try {
        const { organizationId } = await getUserContext();

        const layout = await db.recordPageLayout.findUnique({
            where: { id: layoutId },
        });

        if (!layout || layout.organizationId !== organizationId) {
            return { success: false, error: "Layout not found." };
        }

        if (layout.isDefault) {
            return { success: false, error: "Set another layout as default before deleting this one." };
        }

        await db.$transaction(async (tx) => {
            await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.RECORD_PAGE_LAYOUT, layoutId);
            await tx.recordPageLayout.delete({
                where: { id: layoutId },
            });
        });

        revalidatePath(`/admin/objects/${layout.objectDefId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Record Page Layout Error:", error);
        return { success: false, error: error.message || "Failed to delete layout" };
    }
}
