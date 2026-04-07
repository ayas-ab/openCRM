import { describe, expect, it } from "vitest";
import { escapeCsv, formatCsvCell, sanitizeCsvFormula } from "@/lib/csv";

describe("csv formatting", () => {
    it("neutralizes spreadsheet formula prefixes", () => {
        expect(sanitizeCsvFormula("=1+1")).toBe("'=1+1");
        expect(sanitizeCsvFormula("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
        expect(sanitizeCsvFormula("-2+3")).toBe("'-2+3");
        expect(sanitizeCsvFormula("@cmd")).toBe("'@cmd");
        expect(sanitizeCsvFormula("  =A1")).toBe("'  =A1");
    });

    it("does not modify safe values", () => {
        expect(sanitizeCsvFormula("normal text")).toBe("normal text");
        expect(sanitizeCsvFormula("12345")).toBe("12345");
        expect(sanitizeCsvFormula("'=already-safe")).toBe("'=already-safe");
    });

    it("keeps existing csv escaping behavior", () => {
        expect(escapeCsv("hello")).toBe("hello");
        expect(escapeCsv("a,b")).toBe('"a,b"');
        expect(escapeCsv("first\nsecond")).toBe('"first\nsecond"');
        expect(escapeCsv('he said "hi"')).toBe('he said ""hi""');
    });

    it("applies formula neutralization before escaping", () => {
        expect(formatCsvCell("=A1,A2")).toBe("\"'=A1,A2\"");
        expect(formatCsvCell("normal,value")).toBe('"normal,value"');
    });
});
