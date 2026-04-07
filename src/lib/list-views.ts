import { db } from "@/lib/db";
import { ListViewPrincipalType, Prisma } from "@prisma/client";

type ListViewAccessContext = {
    organizationId: number;
    objectDefId: number;
    userId: number;
    userType: string;
    groupId: number | null;
    permissionSetIds: number[];
};

async function getListViewAccessContext(
    userId: number,
    organizationId: number,
    objectDefId: number
): Promise<ListViewAccessContext> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            userType: true,
            groupId: true,
        },
    });

    const permissionSets = await db.permissionSetAssignment.findMany({
        where: { userId },
        select: { permissionSetId: true },
    });

    return {
        organizationId,
        objectDefId,
        userId,
        userType: user?.userType ?? "standard",
        groupId: user?.groupId ?? null,
        permissionSetIds: permissionSets.map((set) => set.permissionSetId),
    };
}

function buildListViewAccessWhere(ctx: ListViewAccessContext) {
    if (ctx.userType === "admin") {
        return {
            organizationId: ctx.organizationId,
            objectDefId: ctx.objectDefId,
        } satisfies Prisma.ListViewWhereInput;
    }

    const shared: Prisma.ListViewWhereInput[] = [{ isGlobal: true }];

    if (ctx.groupId) {
        shared.push({
            shares: {
                some: {
                    principalType: ListViewPrincipalType.GROUP,
                    principalId: ctx.groupId,
                },
            },
        });
    }

    if (ctx.permissionSetIds.length > 0) {
        shared.push({
            shares: {
                some: {
                    principalType: ListViewPrincipalType.PERMISSION_SET,
                    principalId: { in: ctx.permissionSetIds },
                },
            },
        });
    }

    return {
        organizationId: ctx.organizationId,
        objectDefId: ctx.objectDefId,
        OR: shared,
    } satisfies Prisma.ListViewWhereInput;
}

export async function getAccessibleListViews(
    userId: number,
    organizationId: number,
    objectDefId: number
) {
    const ctx = await getListViewAccessContext(userId, organizationId, objectDefId);
    const where = buildListViewAccessWhere(ctx);

    return db.listView.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
            id: true,
            name: true,
            isDefault: true,
            isGlobal: true,
            updatedAt: true,
        },
    });
}

export async function getAccessibleListViewById(
    userId: number,
    organizationId: number,
    objectDefId: number,
    listViewId: number
) {
    const ctx = await getListViewAccessContext(userId, organizationId, objectDefId);
    const where = buildListViewAccessWhere(ctx);

    return db.listView.findFirst({
        where: {
            ...where,
            id: listViewId,
        },
        include: {
            columns: {
                orderBy: { sortOrder: "asc" },
                include: {
                    fieldDef: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                },
            },
            shares: true,
        },
    });
}

export async function getUserListViewPreference(
    userId: number,
    organizationId: number,
    objectDefId: number
) {
    return db.userListViewPreference.findFirst({
        where: {
            userId,
            organizationId,
            objectDefId,
        },
        select: {
            defaultListViewId: true,
        },
    });
}

export async function getPinnedListViewIds(userId: number, objectDefId: number, organizationId?: number) {
    const pins = await db.listViewPin.findMany({
        where: {
            userId,
            ...(organizationId ? { organizationId } : {}),
            listView: {
                objectDefId,
            },
        },
        select: { listViewId: true },
    });

    return pins.map((pin) => pin.listViewId);
}
