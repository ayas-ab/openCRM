import { describe, expect, it } from "vitest";
import { OwnerType, ShareAccessLevel } from "@prisma/client";
import { buildRecordAccessFilter, buildRecordAccessSql } from "@/lib/record-access";

describe("record-access", () => {
    it("builds read filters with owner, queue, and share access", () => {
        const filter = buildRecordAccessFilter(1, [2], 3, "read");

        expect(filter.OR).toEqual(
            expect.arrayContaining([
                { ownerId: 1, ownerType: OwnerType.USER },
                { ownerQueueId: { in: [2] } },
            ])
        );

        const shareClause = (filter.OR ?? []).find((entry) => "shares" in entry) as any;
        expect(shareClause).toBeTruthy();
        const shareOr = shareClause.shares.some.OR;
        const userShare = shareOr.find((entry: any) => entry.principalType === "USER");
        const groupShare = shareOr.find((entry: any) => entry.principalType === "GROUP");

        expect(userShare.accessLevel.in).toEqual(
            expect.arrayContaining([
                ShareAccessLevel.READ,
                ShareAccessLevel.EDIT,
                ShareAccessLevel.DELETE,
            ])
        );
        expect(groupShare.accessLevel.in).toEqual(
            expect.arrayContaining([
                ShareAccessLevel.READ,
                ShareAccessLevel.EDIT,
                ShareAccessLevel.DELETE,
            ])
        );
    });

    it("omits queue access for edit and delete", () => {
        const filter = buildRecordAccessFilter(1, [2], 3, "edit");
        expect(filter.OR).toEqual(
            expect.arrayContaining([{ ownerId: 1, ownerType: OwnerType.USER }])
        );
        expect(filter.OR).toEqual(
            expect.not.arrayContaining([{ ownerQueueId: { in: [2] } }])
        );
    });

    it("buildRecordAccessSql includes share and queue predicates", () => {
        const sql = buildRecordAccessSql(1, 1, [2], 3, "read");
        expect(sql.sql).toContain("RecordShare");
        expect(sql.sql).toContain("ownerId");
        expect(sql.sql).toContain("ownerQueueId");
    });

    it("buildRecordAccessSql omits queue predicate for edit", () => {
        const sql = buildRecordAccessSql(1, 1, [2], 3, "edit");
        expect(sql.sql).toContain("RecordShare");
        expect(sql.sql).toContain("ownerId");
        expect(sql.sql).not.toContain("ownerQueueId IN");
    });
});
