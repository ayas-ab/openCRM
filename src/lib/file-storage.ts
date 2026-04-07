import { promises as fs } from "fs";
import path from "path";

const UPLOAD_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "uploads");

export type AttachmentPathInput = {
    organizationId: number;
    recordId: number;
    fieldDefId: number;
    attachmentId: number;
};

export function buildAttachmentStoragePath({
    organizationId,
    recordId,
    fieldDefId,
    attachmentId,
}: AttachmentPathInput) {
    const relativePath = path
        .posix
        .join("uploads", String(organizationId), String(recordId), String(fieldDefId), String(attachmentId));
    const absolutePath = path.join(
        UPLOAD_ROOT,
        String(organizationId),
        String(recordId),
        String(fieldDefId),
        String(attachmentId)
    );
    return { relativePath, absolutePath };
}

export function resolveStoragePath(storagePath: string) {
    const resolved = path.isAbsolute(storagePath)
        ? path.resolve(storagePath)
        : path.resolve(/* turbopackIgnore: true */ process.cwd(), storagePath);
    const relative = path.relative(UPLOAD_ROOT, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Invalid storage path");
    }
    return resolved;
}

export async function ensureParentDir(absolutePath: string) {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
}

export async function deleteFileSafe(absolutePath: string) {
    try {
        await fs.unlink(absolutePath);
    } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
    }
}

export async function deleteFolderSafe(absolutePath: string) {
    try {
        await fs.rm(absolutePath, { recursive: true, force: true });
    } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
    }
}
