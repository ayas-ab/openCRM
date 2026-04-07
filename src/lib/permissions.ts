import { db } from "@/lib/db";

export type PermissionAction =
    | "read"
    | "create"
    | "edit"
    | "delete"
    | "viewAll"
    | "modifyAll"
    | "modifyListViews";

export type SystemPermission = "dataLoading";

type ObjectAccessSummary = {
    canReadOwn: boolean;
    canCreate: boolean;
    canEditOwn: boolean;
    canDeleteOwn: boolean;
    canReadAll: boolean;
    canModifyAll: boolean;
    canModifyListViews: boolean;
};

const EMPTY_ACCESS: ObjectAccessSummary = Object.freeze({
    canReadOwn: false,
    canCreate: false,
    canEditOwn: false,
    canDeleteOwn: false,
    canReadAll: false,
    canModifyAll: false,
    canModifyListViews: false,
});

/**
 * Helper function to get all Permission Set IDs for a user.
 * This includes:
 * 1. Direct assignments (User -> PermissionSet)
 * 2. Group-based assignments (User -> Group -> PermissionSets)
 * 
 * Note: The schema doesn't have PermissionSetGroupAssignment, so groups are
 * expanded at assignment time via the assignPermissionSetGroup action.
 */
export async function getUserPermissionSetIds(userId: number): Promise<number[]> {
    if (!userId || isNaN(userId)) return [];

    // Fetch direct permission set assignments
    const directAssignments = await db.permissionSetAssignment.findMany({
        where: { userId },
        select: { permissionSetId: true },
    });

    return directAssignments.map(a => a.permissionSetId);
}

function mergeObjectAccess(target: ObjectAccessSummary, perm: {
    allowRead: boolean;
    allowCreate: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    allowViewAll: boolean;
    allowModifyAll: boolean;
    allowModifyListViews: boolean;
}) {
    target.canModifyAll ||= perm.allowModifyAll;
    target.canReadAll ||= perm.allowViewAll || perm.allowModifyAll;
    target.canReadOwn ||= perm.allowRead || perm.allowViewAll || perm.allowModifyAll;
    target.canCreate ||= perm.allowCreate;
    target.canEditOwn ||= perm.allowEdit || perm.allowModifyAll;
    target.canDeleteOwn ||= perm.allowDelete || perm.allowModifyAll;
    target.canModifyListViews ||= perm.allowModifyListViews;
}

function accessAllowsAction(access: ObjectAccessSummary | null, action: PermissionAction) {
    if (!access) return false;

    switch (action) {
        case "read":
            return access.canReadOwn;
        case "create":
            return access.canCreate;
        case "edit":
            return access.canEditOwn || access.canModifyAll;
        case "delete":
            return access.canDeleteOwn || access.canModifyAll;
        case "viewAll":
            return access.canReadAll;
        case "modifyAll":
            return access.canModifyAll;
        case "modifyListViews":
            return access.canModifyListViews;
        default:
            return false;
    }
}

async function buildObjectAccessMap(
    userId: number,
    organizationId: number,
    targetObjectDefId?: number
): Promise<Map<number, ObjectAccessSummary>> {
    const permissionSetIds = await getUserPermissionSetIds(userId);
    const accessMap = new Map<number, ObjectAccessSummary>();

    if (permissionSetIds.length === 0) {
        return accessMap;
    }

    const whereClause: any = {
        permissionSetId: { in: permissionSetIds },
        objectDef: {
            organizationId,
        },
    };

    if (targetObjectDefId) {
        whereClause.objectDefId = targetObjectDefId;
    }

    const permissions = await db.objectPermission.findMany({
        where: whereClause,
        select: {
            objectDefId: true,
            allowRead: true,
            allowCreate: true,
            allowEdit: true,
            allowDelete: true,
            allowViewAll: true,
            allowModifyAll: true,
            allowModifyListViews: true,
        },
    });

    for (const perm of permissions) {
        const current = accessMap.get(perm.objectDefId) ?? { ...EMPTY_ACCESS };
        mergeObjectAccess(current, perm);
        accessMap.set(perm.objectDefId, current);
    }

    return accessMap;
}

export async function getObjectAccessSummary(
    userId: number,
    organizationId: number,
    objectDefId: number
): Promise<ObjectAccessSummary | null> {
    const map = await buildObjectAccessMap(userId, organizationId, objectDefId);
    return map.get(objectDefId) ?? null;
}

export async function getReadableObjectIds(userId: number, organizationId: number): Promise<number[]> {
    const accessMap = await buildObjectAccessMap(userId, organizationId);
    const readable: number[] = [];

    accessMap.forEach((access, objectDefId) => {
        if (access.canReadOwn) {
            readable.push(objectDefId);
        }
    });

    return readable;
}

export async function getSearchableObjects(
    userId: number,
    organizationId: number
): Promise<
    Array<{
        id: number;
        apiName: string;
        label: string;
        pluralLabel: string;
        icon: string | null;
        access: ObjectAccessSummary;
    }>
> {
    const accessMap = await buildObjectAccessMap(userId, organizationId);
    const readableIds = Array.from(accessMap.entries())
        .filter(([, access]) => access.canReadOwn)
        .map(([objectDefId]) => objectDefId);

    if (readableIds.length === 0) {
        return [];
    }

    const objectDefs = await db.objectDefinition.findMany({
        where: {
            organizationId,
            id: { in: readableIds },
        },
        select: {
            id: true,
            apiName: true,
            label: true,
            pluralLabel: true,
            icon: true,
        },
        orderBy: { label: "asc" },
    });

    return objectDefs.map(def => ({
        ...def,
        access: accessMap.get(def.id) ?? { ...EMPTY_ACCESS },
    }));
}

export async function checkPermission(
    userId: number,
    organizationId: number,
    objectApiName: string,
    action: PermissionAction
): Promise<boolean> {
    // Validate inputs
    if (!userId || isNaN(userId) || !organizationId || isNaN(organizationId)) {
        console.error("Invalid userId or organizationId in checkPermission");
        return false;
    }

    // 1. Fetch Object Definition ID
    const objectDef = await db.objectDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: objectApiName,
            },
        },
    });

    if (!objectDef) return false;

    const access = await getObjectAccessSummary(userId, organizationId, objectDef.id);

    return accessAllowsAction(access, action);
}

export async function getAvailableApps(userId: number, organizationId: number, userType: string) {
    // Validate inputs
    if (!userId || isNaN(userId) || !organizationId || isNaN(organizationId)) {
        console.error("Invalid userId or organizationId in getAvailableApps", { userId, organizationId });
        return [];
    }

    // 1. Admin gets everything - REMOVED per user request
    // if (userType === "admin") {
    //     return db.appDefinition.findMany({
    //         where: { organizationId },
    //         orderBy: { name: "asc" },
    //     });
    // }

    // 2. Get all permission set IDs for this user
    const permissionSetIds = await getUserPermissionSetIds(userId);

    if (permissionSetIds.length === 0) return [];

    // 3. Find Apps authorized by these sets
    const appPermissions = await db.appPermission.findMany({
        where: {
            permissionSetId: { in: permissionSetIds },
        },
        select: { appId: true },
    });

    const appIds = [...new Set(appPermissions.map(ap => ap.appId))]; // Deduplicate

    if (appIds.length === 0) return [];

    // 4. Return App Definitions
    return db.appDefinition.findMany({
        where: {
            id: { in: appIds },
            organizationId,
        },
        orderBy: { name: "asc" },
    });
}

export async function hasSystemPermission(
    userId: number,
    organizationId: number,
    permission: SystemPermission
): Promise<boolean> {
    if (!userId || isNaN(userId) || !organizationId || isNaN(organizationId)) {
        console.error("Invalid userId or organizationId in hasSystemPermission");
        return false;
    }

    const permissionSetIds = await getUserPermissionSetIds(userId);
    if (permissionSetIds.length === 0) return false;

    if (permission === "dataLoading") {
        const match = await db.permissionSet.findFirst({
            where: {
                id: { in: permissionSetIds },
                organizationId,
                allowDataLoading: true,
            },
            select: { id: true },
        });
        return Boolean(match);
    }

    return false;
}
