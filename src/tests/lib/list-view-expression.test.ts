import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
    buildListViewExpressionFilter,
    buildListViewExpressionSql,
    buildListViewFieldFilter,
    parseListViewExpression,
    tokenizeListViewExpression,
    validateListViewExpression,
} from "@/lib/list-view-expression";

describe("list view expression", () => {
    it("parses and builds filters for valid expressions", () => {
        const tokens = tokenizeListViewExpression("1 AND (2 OR 3)");
        expect(tokens).not.toBeNull();
        const ast = parseListViewExpression(tokens!);
        expect(validateListViewExpression(ast, 3)).toBe(true);

        const filter = buildListViewExpressionFilter(ast, [
            { a: 1 } as any,
            { b: 2 } as any,
            { c: 3 } as any,
        ]);

        expect(filter).toEqual({
            AND: [
                { a: 1 },
                {
                    OR: [{ b: 2 }, { c: 3 }],
                },
            ],
        });
    });

    it("rejects invalid tokens", () => {
        const tokens = tokenizeListViewExpression("1 AND X");
        expect(tokens).toBeNull();
    });

    it("enforces condition index bounds", () => {
        const tokens = tokenizeListViewExpression("2");
        const ast = parseListViewExpression(tokens!);
        expect(validateListViewExpression(ast, 1)).toBe(false);
    });

    it("supports NOT expressions", () => {
        const tokens = tokenizeListViewExpression("NOT 1");
        const ast = parseListViewExpression(tokens!);
        const filter = buildListViewExpressionFilter(ast, [{ a: 1 } as any]);
        expect(filter).toEqual({ NOT: { a: 1 } });

        const sql = buildListViewExpressionSql(ast, [Prisma.sql`r."id" = 1`]);
        expect(sql?.sql).toContain("NOT");
    });

    it("supports legacy symbol syntax for backward compatibility", () => {
        const tokens = tokenizeListViewExpression("1 && (2 || !3)");
        expect(tokens).toEqual(["1", "&&", "(", "2", "||", "!", "3", ")"]);
        const ast = parseListViewExpression(tokens!);
        expect(validateListViewExpression(ast, 3)).toBe(true);
    });

    it("accepts mixed-case textual operators", () => {
        const tokens = tokenizeListViewExpression("1 aNd (2 oR NoT 3)");
        expect(tokens).not.toBeNull();
        const ast = parseListViewExpression(tokens!);
        expect(validateListViewExpression(ast, 3)).toBe(true);
    });

    it("excludes unsupported field types", () => {
        const filter = buildListViewFieldFilter({ id: 1, type: "TextArea" }, "equals", "text");
        expect(filter).toBeNull();
    });

    it("treats Date equality as a full-day range", () => {
        const filter = buildListViewFieldFilter({ id: 1, type: "Date" }, "equals", "1990-05-10");
        expect(filter).toEqual({
            fields: {
                some: {
                    fieldDefId: 1,
                    valueDate: {
                        gte: new Date("1990-05-10T00:00:00.000Z"),
                        lt: new Date("1990-05-11T00:00:00.000Z"),
                    },
                },
            },
        });
    });

    it("keeps DateTime equality exact", () => {
        const filter = buildListViewFieldFilter({ id: 1, type: "DateTime" }, "equals", "2026-03-18T10:15:00Z");
        expect(filter).toEqual({
            fields: {
                some: {
                    fieldDefId: 1,
                    valueDate: new Date("2026-03-18T10:15:00.000Z"),
                },
            },
        });
    });
});
