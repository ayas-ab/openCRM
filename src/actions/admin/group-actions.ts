"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
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

const groupSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
});

export async function createGroup(data: z.infer<typeof groupSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = groupSchema.parse(data);

        await db.group.create({
            data: {
                organizationId,
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath("/admin/groups");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A group with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function updateGroup(groupId: number, data: z.infer<typeof groupSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = groupSchema.parse(data);

        const existing = await db.group.findUnique({
            where: { id: groupId, organizationId },
        });
        if (!existing) return { success: false, error: "Group not found." };

        await db.group.update({
            where: { id: groupId },
            data: {
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath(`/admin/groups/${groupId}`);
        revalidatePath("/admin/groups");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A group with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function deleteGroup(groupId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const existing = await db.group.findUnique({
            where: { id: groupId, organizationId },
        });
        if (!existing) return { success: false, error: "Group not found." };

        await db.group.delete({ where: { id: groupId } });

        revalidatePath("/admin/groups");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

const groupMemberSchema = z.object({
    userId: z.number(),
    groupId: z.number().nullable(),
});

export async function assignUserToGroup(groupId: number, userId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = groupMemberSchema.parse({ userId, groupId });

        const group = await db.group.findUnique({
            where: { id: validated.groupId ?? 0, organizationId },
        });
        if (!group) return { success: false, error: "Group not found." };

        const user = await db.user.findUnique({
            where: { id: validated.userId, organizationId },
        });
        if (!user) return { success: false, error: "User not found." };

        if (user.groupId === validated.groupId) {
            return { success: true };
        }

        await db.user.update({
            where: { id: validated.userId },
            data: { groupId: validated.groupId },
        });

        await enqueueSharingRecomputeForOrg(organizationId);

        revalidatePath(`/admin/groups/${validated.groupId}`);
        revalidatePath("/admin/groups");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeUserFromGroup(userId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const user = await db.user.findUnique({
            where: { id: userId, organizationId },
        });
        if (!user) return { success: false, error: "User not found." };

        if (user.groupId === null) {
            return { success: true };
        }

        await db.user.update({
            where: { id: userId },
            data: { groupId: null },
        });

        await enqueueSharingRecomputeForOrg(organizationId);

        revalidatePath("/admin/groups");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
