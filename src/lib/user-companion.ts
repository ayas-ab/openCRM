import { Prisma, type PrismaClient, OwnerType } from "@prisma/client";

type DbLike = PrismaClient | Prisma.TransactionClient;

export const USER_OBJECT_API_NAME = "user";
export const USER_ID_FIELD_API_NAME = "user_id";
export const RESERVED_OBJECT_API_NAMES = new Set(["dashboard", USER_OBJECT_API_NAME]);

export function isReservedObjectApiName(apiName: string) {
    return RESERVED_OBJECT_API_NAMES.has(apiName.trim().toLowerCase());
}

export async function getUserObjectDefinition(tx: DbLike, organizationId: number) {
    return tx.objectDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: USER_OBJECT_API_NAME,
            },
        },
        include: {
            fields: true,
        },
    });
}

export async function getUserCompanionRecordId(
    tx: DbLike,
    organizationId: number,
    userId: number
) {
    const userObject = await getUserObjectDefinition(tx, organizationId);
    if (!userObject) return null;

    const companion = await tx.record.findFirst({
        where: {
            organizationId,
            objectDefId: userObject.id,
            backingUserId: userId,
        },
        select: { id: true },
    });

    if (companion?.id) {
        return companion.id;
    }

    return ensureUserCompanionRecord(tx, organizationId, userId);
}

export async function ensureUserCompanionRecord(
    tx: DbLike,
    organizationId: number,
    userId: number
) {
    const userObject = await getUserObjectDefinition(tx, organizationId);
    if (!userObject) {
        throw new Error("User object is not seeded for this organization.");
    }

    const userIdField = userObject.fields.find((field) => field.apiName === USER_ID_FIELD_API_NAME);
    const nameField = userObject.fields.find((field) => field.apiName === "name");

    if (!userIdField || !nameField) {
        throw new Error("User object is missing required system fields.");
    }

    const user = await tx.user.findFirst({
        where: { id: userId, organizationId },
        select: {
            id: true,
            name: true,
        },
    });

    if (!user) {
        throw new Error("User not found.");
    }

    const existing = await tx.record.findFirst({
        where: {
            organizationId,
            objectDefId: userObject.id,
            backingUserId: user.id,
        },
        select: { id: true },
    });

    const recordName = user.name?.trim() || `User #${user.id}`;

    if (!existing) {
        const created = await tx.record.create({
            data: {
                organizationId,
                objectDefId: userObject.id,
                ownerId: user.id,
                ownerType: OwnerType.USER,
                ownerQueueId: null,
                createdById: user.id,
                lastModifiedById: user.id,
                name: recordName,
                backingUserId: user.id,
            },
            select: { id: true },
        });

        await tx.fieldData.createMany({
            data: [
                {
                    recordId: created.id,
                    fieldDefId: nameField.id,
                    valueText: recordName,
                    valueSearch: recordName.toLowerCase(),
                },
                {
                    recordId: created.id,
                    fieldDefId: userIdField.id,
                    valueText: String(user.id),
                    valueSearch: String(user.id),
                },
            ],
        });

        return created.id;
    }

    await tx.record.update({
        where: { id: existing.id },
        data: {
            ownerId: user.id,
            ownerType: OwnerType.USER,
            ownerQueueId: null,
            name: recordName,
            backingUserId: user.id,
        },
    });

    await tx.fieldData.upsert({
        where: {
            recordId_fieldDefId: {
                recordId: existing.id,
                fieldDefId: nameField.id,
            },
        },
        create: {
            recordId: existing.id,
            fieldDefId: nameField.id,
            valueText: recordName,
            valueSearch: recordName.toLowerCase(),
        },
        update: {
            valueText: recordName,
            valueSearch: recordName.toLowerCase(),
        },
    });

    await tx.fieldData.upsert({
        where: {
            recordId_fieldDefId: {
                recordId: existing.id,
                fieldDefId: userIdField.id,
            },
        },
        create: {
            recordId: existing.id,
            fieldDefId: userIdField.id,
            valueText: String(user.id),
            valueSearch: String(user.id),
        },
        update: {
            valueText: String(user.id),
            valueSearch: String(user.id),
        },
    });

    return existing.id;
}
