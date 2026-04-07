import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";
import { resolveStoragePath } from "@/lib/file-storage";
import { promises as fs } from "fs";

export const runtime = "nodejs";

function sanitizeFilename(filename: string) {
    return filename.replace(/["\\\\]/g, "").trim() || "attachment";
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user as any;
        const userId = parseInt(user.id);
        const organizationId = parseInt(user.organizationId);
        const { id } = await params;
        const attachmentId = Number(id);

        if (Number.isNaN(userId) || Number.isNaN(organizationId) || Number.isNaN(attachmentId)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const fileAttachmentDelegate = (db as any).fileAttachment;
        if (!fileAttachmentDelegate?.findFirst) {
            return NextResponse.json({ error: "File storage not initialized. Run prisma generate/migrate." }, { status: 500 });
        }

        const attachment = await fileAttachmentDelegate.findFirst({
            where: { id: attachmentId, organizationId },
            include: {
                record: {
                    select: {
                        id: true,
                        objectDef: { select: { apiName: true } },
                    },
                },
            },
        });

        if (!attachment) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }
        if (!attachment.storagePath) {
            return NextResponse.json({ error: "File not available" }, { status: 404 });
        }

        const objectApiName = attachment.record.objectDef.apiName;
        const canViewAll = await checkPermission(userId, organizationId, objectApiName, "viewAll");
        if (!canViewAll) {
            const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
            if (!canRead) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            const queueIds = await getUserQueueIds(userId);
            const userGroupId = (await db.user.findUnique({
                where: { id: userId },
                select: { groupId: true },
            }))?.groupId ?? null;
            const accessFilter = buildRecordAccessFilter(userId, queueIds, userGroupId, "read");
            const accessible = await db.record.findFirst({
                where: {
                    id: attachment.record.id,
                    organizationId,
                    ...accessFilter,
                },
                select: { id: true },
            });
            if (!accessible) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const absolutePath = resolveStoragePath(attachment.storagePath);
        const fileBuffer = await fs.readFile(absolutePath);
        const url = new URL(request.url);
        const inline = url.searchParams.get("inline") === "1";
        const filename = sanitizeFilename(attachment.filename || attachment.displayName || "attachment");

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": attachment.mimeType || "application/octet-stream",
                "Content-Disposition": `${inline ? "inline" : "attachment"}; filename=\"${filename}\"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        console.error("File download error:", error);
        return NextResponse.json({ error: "Failed to download file." }, { status: 500 });
    }
}
