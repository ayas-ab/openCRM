import { describe, expect, it, vi } from "vitest";
import {
    coerceFieldValue,
    evaluateCustomLogicExpression,
    filterCandidateIdsByCustomLogicMatches,
    getComparableFieldValue,
    validateCustomLogicExpressionInput,
} from "@/lib/validation/rule-logic";

describe("evaluateCustomLogicExpression", () => {
    it("evaluates textual AND/OR correctly", () => {
        expect(evaluateCustomLogicExpression("1 AND 2", [true, false])).toBe(false);
        expect(evaluateCustomLogicExpression("1 OR 2", [true, false])).toBe(true);
    });

    it("supports legacy symbol operators for backward compatibility", () => {
        expect(evaluateCustomLogicExpression("1 && 2", [true, false])).toBe(false);
        expect(evaluateCustomLogicExpression("1 || 2", [false, true])).toBe(true);
    });

    it("supports NOT and parenthesis grouping", () => {
        expect(evaluateCustomLogicExpression("NOT 1 OR 2", [true, false])).toBe(false);
        expect(evaluateCustomLogicExpression("(1 AND 2) OR 3", [true, false, true])).toBe(true);
    });

    it("supports mixed-case textual operators", () => {
        expect(evaluateCustomLogicExpression("(1 aNd 2) oR nOt 3", [true, true, false])).toBe(true);
    });

    it("returns null for malformed expressions", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(evaluateCustomLogicExpression("1 AND (2 OR", [true, false])).toBeNull();
        expect(evaluateCustomLogicExpression("1 AND abc", [true, false])).toBeNull();
        warnSpy.mockRestore();
    });
});

describe("validateCustomLogicExpressionInput", () => {
    it("rejects incomplete parenthesis expressions", () => {
        expect(validateCustomLogicExpressionInput("(1 AND 2", 2)).toEqual({
            valid: false,
            message: "Expression is incomplete or malformed. Check parentheses and operators.",
        });
    });

    it("normalizes valid expressions", () => {
        expect(validateCustomLogicExpressionInput(" not 1 or 2 ", 2)).toEqual({
            valid: true,
            message: "",
            normalized: "NOT 1 OR 2",
        });
    });
});

describe("filterCandidateIdsByCustomLogicMatches", () => {
    it("evaluates NOT expressions against the full candidate set", () => {
        expect(
            filterCandidateIdsByCustomLogicMatches(
                [101, 102, 103],
                [new Set([101])],
                "NOT 1"
            )
        ).toEqual([102, 103]);
    });
});

describe("temporal comparison semantics", () => {
    it("normalizes Date values to the calendar day", () => {
        expect(coerceFieldValue("Date", "1990-05-10")).toBe(coerceFieldValue("Date", "1990-05-10T18:45:00Z"));
        expect(
            getComparableFieldValue("Date", {
                valueDate: new Date("1990-05-10T23:59:59Z"),
            })
        ).toBe(coerceFieldValue("Date", "1990-05-10"));
    });

    it("preserves exact timestamps for DateTime values", () => {
        expect(coerceFieldValue("DateTime", "2026-03-18T10:15:00Z")).not.toBe(
            coerceFieldValue("DateTime", "2026-03-18T11:15:00Z")
        );
    });
});

