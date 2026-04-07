import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", async () => {
    const { mockDb } = await import("@/tests/utils/prisma-mock");
    return { db: mockDb };
});

import { checkPermission, getReadableObjectIds, getUserPermissionSetIds } from "@/lib/permissions";
import { mockDb, resetMockDb } from "@/tests/utils/prisma-mock";

describe("permissions", () => {
    beforeEach(() => {
        resetMockDb();
    });

    it("returns direct permission set ids", async () => {
        mockDb.permissionSetAssignment.findMany.mockResolvedValue([
            { permissionSetId: 10 },
            { permissionSetId: 11 },
        ]);

        const result = await getUserPermissionSetIds(1);
        expect(result).toEqual([10, 11]);
    });

    it("checkPermission returns false when no permission sets", async () => {
        mockDb.objectDefinition.findUnique.mockResolvedValue({ id: 1 });
        mockDb.permissionSetAssignment.findMany.mockResolvedValue([]);

        const result = await checkPermission(1, 1, "contact", "read");
        expect(result).toBe(false);
    });

    it("getReadableObjectIds includes objects with read access", async () => {
        mockDb.permissionSetAssignment.findMany.mockResolvedValue([{ permissionSetId: 1 }]);
        mockDb.objectPermission.findMany.mockResolvedValue([
            {
                objectDefId: 1,
                allowRead: true,
                allowCreate: false,
                allowEdit: false,
                allowDelete: false,
                allowViewAll: false,
                allowModifyAll: false,
                allowModifyListViews: false,
            },
            {
                objectDefId: 2,
                allowRead: false,
                allowCreate: false,
                allowEdit: false,
                allowDelete: false,
                allowViewAll: true,
                allowModifyAll: false,
                allowModifyListViews: false,
            },
            {
                objectDefId: 3,
                allowRead: false,
                allowCreate: false,
                allowEdit: false,
                allowDelete: false,
                allowViewAll: false,
                allowModifyAll: true,
                allowModifyListViews: false,
            },
            {
                objectDefId: 4,
                allowRead: false,
                allowCreate: true,
                allowEdit: false,
                allowDelete: false,
                allowViewAll: false,
                allowModifyAll: false,
                allowModifyListViews: false,
            },
        ]);

        const result = await getReadableObjectIds(1, 1);
        expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });
});
