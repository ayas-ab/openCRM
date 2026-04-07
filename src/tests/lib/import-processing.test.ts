import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, findDuplicateMatchesMock } = vi.hoisted(() => ({
    mockDb: {
        importJob: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        fieldDefinition: {
            findMany: vi.fn(),
        },
        duplicateRuleCondition: {
            findMany: vi.fn(),
        },
        fieldData: {
            findMany: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        importRow: {
            update: vi.fn(),
        },
        $transaction: vi.fn(),
    },
    findDuplicateMatchesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    db: mockDb,
}));

vi.mock("@/lib/duplicates/duplicate-rules", () => ({
    findDuplicateMatches: findDuplicateMatchesMock,
}));

import { processImportJob } from "@/lib/import-processing";

describe("import-processing", () => {
    beforeEach(() => {
        Object.values(mockDb).forEach((group) => {
            Object.values(group).forEach((fn) => {
                if (typeof fn === "function" && "mockReset" in fn) {
                    (fn as ReturnType<typeof vi.fn>).mockReset();
                }
            });
        });
        findDuplicateMatchesMock.mockReset();
    });

    it("merges existing record values into duplicate checks for import updates", async () => {
        mockDb.importJob.findUnique.mockResolvedValue({
            id: 1,
            organizationId: 10,
            objectDefId: 20,
            createdById: 5,
            mode: "UPDATE",
            rows: [
                {
                    id: 100,
                    rowIndex: 1,
                    rawData: {
                        ext_id: "EXT-1",
                        first_name: "Alice",
                    },
                },
            ],
            objectDef: {
                fields: [
                    {
                        id: 1,
                        objectDefId: 20,
                        apiName: "ext_id",
                        label: "External ID",
                        type: "Text",
                        required: true,
                        isExternalId: true,
                        isUnique: false,
                        lookupTargetId: null,
                        options: null,
                        picklistOptions: [],
                    },
                    {
                        id: 2,
                        objectDefId: 20,
                        apiName: "first_name",
                        label: "First Name",
                        type: "Text",
                        required: false,
                        isExternalId: false,
                        isUnique: false,
                        lookupTargetId: null,
                        options: null,
                        picklistOptions: [],
                    },
                    {
                        id: 3,
                        objectDefId: 20,
                        apiName: "last_name",
                        label: "Last Name",
                        type: "Text",
                        required: false,
                        isExternalId: false,
                        isUnique: false,
                        lookupTargetId: null,
                        options: null,
                        picklistOptions: [],
                    },
                ],
            },
        });

        mockDb.importJob.update.mockResolvedValue(undefined);
        mockDb.fieldDefinition.findMany.mockResolvedValue([]);
        mockDb.duplicateRuleCondition.findMany.mockResolvedValue([
            { fieldDefId: 2 },
            { fieldDefId: 3 },
        ]);
        mockDb.fieldData.findMany
            .mockResolvedValueOnce([
                {
                    recordId: 77,
                    valueSearch: "ext-1",
                    valueText: "EXT-1",
                },
            ])
            .mockResolvedValueOnce([
                {
                    recordId: 77,
                    fieldDefId: 3,
                    valueText: "Smith",
                    valueDate: null,
                    valueBoolean: null,
                    valueLookup: null,
                    valuePicklistId: null,
                },
            ]);
        mockDb.user.findUnique.mockResolvedValue({
            id: 5,
            groupId: null,
            queueMemberships: [],
        });
        mockDb.importRow.update.mockResolvedValue(undefined);
        mockDb.$transaction.mockResolvedValue(undefined);

        findDuplicateMatchesMock.mockResolvedValue({
            blockingRuleIds: [1],
            warningRuleIds: [],
            visibleMatches: [],
            hiddenMatchCount: 0,
        });

        await processImportJob(1);

        expect(findDuplicateMatchesMock).toHaveBeenCalledTimes(1);
        expect(findDuplicateMatchesMock).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "edit",
                recordId: 77,
                valueMap: expect.objectContaining({
                    ext_id: "EXT-1",
                    first_name: "Alice",
                    last_name: "Smith",
                }),
            })
        );
    });
});
