"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { checkPermission } from "@/lib/permissions";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";
import { NotificationType } from "@prisma/client";

const commentSchema = z.object({
    recordId: z.number(),
    bodyText: z.string().trim().min(1, "Comment cannot be empty").max(5000, "Comment is too long"),
});

const updateCommentSchema = z.object({
    commentId: z.number(),
    bodyText: z.string().trim().min(1, "Comment cannot be empty").max(5000, "Comment is too long"),
});

const mentionRegex = /@([a-z0-9]+)/gi;

function extractMentionUsernames(bodyText: string) {
    const matches = bodyText.matchAll(mentionRegex);
    const usernames = new Set<string>();
    for (const match of matches) {
        const username = match[1]?.toLowerCase();
        if (username) usernames.add(username);
    }
    return Array.from(usernames);
}

async function getUserContext() {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");
    const user = session.user as any;
    const userId = parseInt(user.id);
    const organizationId = parseInt(user.organizationId);
    if (Number.isNaN(userId) || Number.isNaN(organizationId)) {
        throw new Error("Invalid session");
    }
    return { userId, organizationId };
}

async function getReadableRecord(
    recordId: number,
    userId: number,
    organizationId: number,
    canReadAll: boolean
) {
    const queueIds = await getUserQueueIds(userId);
    const userGroupId =
        (await db.user.findUnique({
            where: { id: userId },
            select: { groupId: true },
        }))?.groupId ?? null;
    const accessFilter = canReadAll
        ? null
        : buildRecordAccessFilter(userId, queueIds, userGroupId, "read");
    return db.record.findFirst({
        where: {
            id: recordId,
            organizationId,
            ...(accessFilter ?? {}),
        },
        select: {
            id: true,
            name: true,
            objectDef: {
                select: { apiName: true, label: true, enableChatter: true },
            },
        },
    });
}

export async function createRecordComment(data: z.infer<typeof commentSchema>) {
    try {
        const { userId, organizationId } = await getUserContext();
        const payload = commentSchema.parse(data);

        const baseRecord = await db.record.findFirst({
            where: {
                id: payload.recordId,
                organizationId,
            },
            select: {
                id: true,
                name: true,
                objectDef: {
                    select: { apiName: true, label: true, enableChatter: true },
                },
            },
        });

        if (!baseRecord) return { success: false, error: "Record not found or access denied." };

        const canRead = await checkPermission(userId, organizationId, baseRecord.objectDef.apiName, "read");
        if (!canRead) return { success: false, error: "Record not found or access denied." };
        if (!baseRecord.objectDef.enableChatter) {
            return { success: false, error: "Chatter is disabled for this object." };
        }

        const canReadAll =
            (await checkPermission(userId, organizationId, baseRecord.objectDef.apiName, "viewAll")) ||
            (await checkPermission(userId, organizationId, baseRecord.objectDef.apiName, "modifyAll"));

        const record = canReadAll
            ? baseRecord
            : await getReadableRecord(payload.recordId, userId, organizationId, canReadAll);

        if (!record) return { success: false, error: "Record not found or access denied." };

        const comment = await db.recordComment.create({
            data: {
                organizationId,
                recordId: payload.recordId,
                authorId: userId,
                bodyText: payload.bodyText,
            },
            include: {
                author: {
                    select: { id: true, name: true, email: true, username: true },
                },
            },
        });

        const mentionedUsernames = extractMentionUsernames(payload.bodyText);
        if (mentionedUsernames.length > 0) {
            const mentionedUsers = await db.user.findMany({
                where: {
                    organizationId,
                    username: { in: mentionedUsernames },
                },
                select: { id: true, username: true },
            });

            const mentionTargets = mentionedUsers.filter((user) => user.id !== userId);
            if (mentionTargets.length > 0) {
                const recordLabel = record.name || `${record.objectDef.label} #${record.id}`;
                const authorLabel =
                    comment.author.name || comment.author.email || `User #${comment.authorId}`;
                await db.recordCommentMention.createMany({
                    data: mentionTargets.map((user) => ({
                        commentId: comment.id,
                        userId: user.id,
                    })),
                    skipDuplicates: true,
                });

                await db.notification.createMany({
                    data: mentionTargets.map((user) => ({
                        organizationId,
                        userId: user.id,
                        recordId: payload.recordId,
                        type: NotificationType.COMMENT_MENTION,
                        message: `${authorLabel} mentioned you in ${recordLabel}.`,
                    })),
                });
            }
        }

        return {
            success: true,
            comment: {
                id: comment.id,
                recordId: comment.recordId,
                authorId: comment.authorId,
                authorName: comment.author.name || comment.author.email || `User #${comment.authorId}`,
                authorUsername: comment.author.username,
                bodyText: comment.bodyText,
                createdAt: comment.createdAt.toISOString(),
                editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to add comment." };
    }
}

export async function updateRecordComment(data: z.infer<typeof updateCommentSchema>) {
    try {
        const { userId, organizationId } = await getUserContext();
        const payload = updateCommentSchema.parse(data);

        const comment = await db.recordComment.findUnique({
            where: { id: payload.commentId },
            include: {
                record: { select: { id: true, organizationId: true, objectDef: { select: { apiName: true, enableChatter: true } } } },
            },
        });

        if (!comment || comment.organizationId !== organizationId || comment.isDeleted) {
            return { success: false, error: "Comment not found." };
        }

        const canRead = await checkPermission(userId, organizationId, comment.record.objectDef.apiName, "read");
        if (!canRead) return { success: false, error: "INSUFFICIENT_PERMISSIONS" };
        if (!comment.record.objectDef.enableChatter) return { success: false, error: "Chatter is disabled for this object." };

        const canReadAll =
            (await checkPermission(userId, organizationId, comment.record.objectDef.apiName, "viewAll")) ||
            (await checkPermission(userId, organizationId, comment.record.objectDef.apiName, "modifyAll"));

        if (!canReadAll) {
            const record = await getReadableRecord(comment.recordId, userId, organizationId, canReadAll);
            if (!record) return { success: false, error: "Record not found or access denied." };
        }

        const canModifyAll = await checkPermission(userId, organizationId, comment.record.objectDef.apiName, "modifyAll");
        if (comment.authorId !== userId && !canModifyAll) {
            return { success: false, error: "You do not have permission to edit this comment." };
        }

        await db.recordComment.update({
            where: { id: comment.id },
            data: {
                bodyText: payload.bodyText,
                editedAt: new Date(),
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to update comment." };
    }
}

export async function deleteRecordComment(commentId: number) {
    try {
        await getUserContext();
        return { success: false, error: "Deleting comments is disabled." };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to delete comment." };
    }
}
