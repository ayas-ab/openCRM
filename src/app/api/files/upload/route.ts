import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";
import {
    buildAttachmentStoragePath,
    deleteFileSafe,
    ensureParentDir,
    resolveStoragePath,
} from "@/lib/file-storage";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SVG_MIME = "image/svg+xml";
const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const ALLOWED_ALL_MIMES = new Set([
    ...Array.from(ALLOWED_IMAGE_MIMES),
    "application/pdf",
    DOCX_MIME,
]);

function guessMimeType(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".docx") return DOCX_MIME;
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".gif") return "image/gif";
    if (ext === ".webp") return "image/webp";
    return "";
}

function isSvgBuffer(buffer: Buffer) {
    const head = buffer.slice(0, 512).toString("utf8").toLowerCase();
    return head.includes("<svg");
}

function detectMimeFromBuffer(buffer: Buffer, filename: string) {
    if (isSvgBuffer(buffer)) return SVG_MIME;
    if (buffer.length >= 5 && buffer.slice(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
    if (
        buffer.length >= 8 &&
        buffer
            .slice(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return "image/png";
    }
    if (buffer.length >= 3 && buffer.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        return "image/jpeg";
    }
    if (buffer.length >= 6) {
        const gifHeader = buffer.slice(0, 6).toString("ascii");
        if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
    }
    if (buffer.length >= 12) {
        const riff = buffer.slice(0, 4).toString("ascii");
        const webp = buffer.slice(8, 12).toString("ascii");
        if (riff === "RIFF" && webp === "WEBP") return "image/webp";
    }
    if (buffer.length >= 4) {
        const zip = buffer.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        if (zip && path.extname(filename).toLowerCase() === ".docx") {
            return DOCX_MIME;
        }
    }
    return "";
}

function isAllowedMime(allowedTypes: string, mimeType: string) {
    const normalized = allowedTypes || "all";
    if (normalized === "images") return ALLOWED_IMAGE_MIMES.has(mimeType);
    if (normalized === "pdf") return mimeType === "application/pdf";
    if (normalized === "docx") return mimeType === DOCX_MIME;
    if (normalized === "all") return ALLOWED_ALL_MIMES.has(mimeType);
    return ALLOWED_ALL_MIMES.has(mimeType);
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user as any;
        const userId = parseInt(user.id);
        const organizationId = parseInt(user.organizationId);

        if (Number.isNaN(userId) || Number.isNaN(organizationId)) {
            return NextResponse.json({ error: "Invalid session" }, { status: 400 });
        }

        const formData = await request.formData();
        const recordId = Number(formData.get("recordId"));
        const fieldDefId = Number(formData.get("fieldDefId"));
        const displayNameRaw = String(formData.get("displayName") ?? "").trim();
        const file = formData.get("file");

        if (!recordId || !fieldDefId || Number.isNaN(recordId) || Number.isNaN(fieldDefId)) {
            return NextResponse.json({ error: "Missing recordId or fieldDefId" }, { status: 400 });
        }

        if (!file || typeof (file as File).arrayBuffer !== "function") {
            return NextResponse.json({ error: "Missing file" }, { status: 400 });
        }

        const fileBlob = file as File;
        const displayName = displayNameRaw || fileBlob.name || "Attachment";

        if (fileBlob.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File exceeds max size (10MB)." }, { status: 413 });
        }

        const record = await db.record.findFirst({
            where: { id: recordId, organizationId },
            include: {
                objectDef: { select: { id: true, apiName: true } },
                backingUser: { select: { id: true } },
            },
        });

        if (!record) {
            return NextResponse.json({ error: "Record not found" }, { status: 404 });
        }

        const isOwnUserRecord =
            record.objectDef.apiName === "user" && record.backingUserId === userId;
        const isAdminManagingUserRecord =
            record.objectDef.apiName === "user" && user.userType === "admin" && !!record.backingUserId;

        const canModifyAll = await checkPermission(userId, organizationId, record.objectDef.apiName, "modifyAll");
        if (!canModifyAll && !isOwnUserRecord && !isAdminManagingUserRecord) {
            const canEdit = await checkPermission(userId, organizationId, record.objectDef.apiName, "edit");
            if (!canEdit) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            const queueIds = await getUserQueueIds(userId);
            const userGroupId = (await db.user.findUnique({
                where: { id: userId },
                select: { groupId: true },
            }))?.groupId ?? null;
            const accessFilter = buildRecordAccessFilter(userId, queueIds, userGroupId, "edit");
            const accessible = await db.record.findFirst({
                where: { id: recordId, organizationId, ...accessFilter },
                select: { id: true },
            });
            if (!accessible) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const fieldDef = await db.fieldDefinition.findFirst({
            where: { id: fieldDefId, objectDefId: record.objectDefId },
        });
        if (!fieldDef || fieldDef.type !== "File") {
            return NextResponse.json({ error: "Field is not a file field." }, { status: 400 });
        }

        const options = fieldDef.options && !Array.isArray(fieldDef.options) ? (fieldDef.options as any) : {};
        const allowedTypes = options.allowedTypes ?? "all";
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        const extension = path.extname(fileBlob.name || "").toLowerCase();
        if (fileBlob.type === SVG_MIME || extension === ".svg") {
            return NextResponse.json({ error: "SVG files are not allowed." }, { status: 400 });
        }
        const detectedMime =
            detectMimeFromBuffer(buffer, fileBlob.name) || fileBlob.type || guessMimeType(fileBlob.name);
        if (!detectedMime || detectedMime === SVG_MIME || !isAllowedMime(allowedTypes, detectedMime)) {
            return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
        }

        const fileAttachmentDelegate = (db as any).fileAttachment;
        if (!fileAttachmentDelegate?.findUnique) {
            return NextResponse.json({ error: "File storage not initialized. Run prisma generate/migrate." }, { status: 500 });
        }

        const existing = await fileAttachmentDelegate.findUnique({
            where: {
                recordId_fieldDefId: {
                    recordId,
                    fieldDefId,
                },
            },
        });

        if (existing) {
            const storagePath =
                existing.storagePath ||
                buildAttachmentStoragePath({
                    organizationId,
                    recordId,
                    fieldDefId,
                    attachmentId: existing.id,
                }).relativePath;
            const absolutePath = resolveStoragePath(storagePath);
            await ensureParentDir(absolutePath);
            await fs.writeFile(absolutePath, buffer);

            await fileAttachmentDelegate.update({
                where: { id: existing.id },
                data: {
                    displayName,
                    filename: fileBlob.name,
                    mimeType: detectedMime,
                    size: fileBlob.size,
                    storagePath,
                    createdById: userId,
                },
            });

            return NextResponse.json({
                success: true,
                attachment: {
                    id: existing.id,
                    displayName,
                    filename: fileBlob.name,
                    mimeType: detectedMime,
                    size: fileBlob.size,
                    downloadUrl: `/api/files/${existing.id}`,
                },
            });
        }

        const created = await fileAttachmentDelegate.create({
            data: {
                organizationId,
                recordId,
                fieldDefId,
                displayName,
                filename: fileBlob.name,
                mimeType: detectedMime,
                size: fileBlob.size,
                storagePath: "",
                createdById: userId,
            },
        });

        const { relativePath, absolutePath } = buildAttachmentStoragePath({
            organizationId,
            recordId,
            fieldDefId,
            attachmentId: created.id,
        });

        try {
            await ensureParentDir(absolutePath);
            await fs.writeFile(absolutePath, buffer);
            await fileAttachmentDelegate.update({
                where: { id: created.id },
                data: { storagePath: relativePath },
            });
        } catch (error) {
            await deleteFileSafe(absolutePath);
            await fileAttachmentDelegate.delete({ where: { id: created.id } });
            throw error;
        }

        return NextResponse.json({
            success: true,
            attachment: {
                id: created.id,
                displayName,
                filename: fileBlob.name,
                mimeType: detectedMime,
                size: fileBlob.size,
                downloadUrl: `/api/files/${created.id}`,
            },
        });
    } catch (error) {
        console.error("File upload error:", error);
        return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
    }
}
