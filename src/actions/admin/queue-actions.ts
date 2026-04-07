"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

const queueSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
});

export async function createQueue(data: z.infer<typeof queueSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = queueSchema.parse(data);

        await db.queue.create({
            data: {
                organizationId,
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath("/admin/queues");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A queue with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function updateQueue(queueId: number, data: z.infer<typeof queueSchema>) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = queueSchema.parse(data);

        const existing = await db.queue.findUnique({
            where: { id: queueId, organizationId },
        });
        if (!existing) return { success: false, error: "Queue not found." };

        await db.queue.update({
            where: { id: queueId },
            data: {
                name: validated.name,
                description: validated.description,
            },
        });

        revalidatePath(`/admin/queues/${queueId}`);
        revalidatePath("/admin/queues");
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "A queue with this name already exists." };
        }
        return { success: false, error: error.message };
    }
}

export async function deleteQueue(queueId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const existing = await db.queue.findUnique({
            where: { id: queueId, organizationId },
        });
        if (!existing) return { success: false, error: "Queue not found." };

        await db.queue.delete({ where: { id: queueId } });

        revalidatePath("/admin/queues");
        return { success: true };
    } catch (error: any) {
        if (error?.code === "P2003" || error?.code === "P2014") {
            return {
                success: false,
                error: "This queue can't be deleted yet because it is still in use. Remove members and reassign records or rules first.",
            };
        }
        return { success: false, error: error.message };
    }
}

const queueMemberSchema = z.object({
    queueId: z.number(),
    userId: z.number(),
});

export async function addQueueMember(queueId: number, userId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const validated = queueMemberSchema.parse({ queueId, userId });

        const queue = await db.queue.findUnique({
            where: { id: validated.queueId, organizationId },
        });
        if (!queue) return { success: false, error: "Queue not found." };

        const user = await db.user.findUnique({
            where: { id: validated.userId, organizationId },
        });
        if (!user) return { success: false, error: "User not found." };

        await db.queueMember.create({
            data: {
                queueId: validated.queueId,
                userId: validated.userId,
            },
        });

        revalidatePath(`/admin/queues/${queueId}`);
        return { success: true };
    } catch (error: any) {
        if (error.code === "P2002") {
            return { success: false, error: "User is already in this queue." };
        }
        return { success: false, error: error.message };
    }
}

export async function removeQueueMember(queueId: number, userId: number) {
    try {
        const { organizationId, userType } = await getUserContext();
        if (userType !== "admin") throw new Error("Unauthorized");

        const queue = await db.queue.findUnique({
            where: { id: queueId, organizationId },
        });
        if (!queue) return { success: false, error: "Queue not found." };

        await db.queueMember.deleteMany({
            where: {
                queueId,
                userId,
            },
        });

        revalidatePath(`/admin/queues/${queueId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
