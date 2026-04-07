import { describe, expect, it } from "vitest";
import { normalizeStoredUniqueValue, normalizeUniqueValue } from "@/lib/unique";

describe("unique normalization", () => {
    it("normalizes phone values", () => {
        expect(normalizeUniqueValue("Phone", "+1 (555) 123-0000")).toBe("15551230000");
        expect(normalizeStoredUniqueValue("Phone", "+1 (555) 123-0000")).toBe("15551230000");
    });

    it("normalizes text values to lowercase", () => {
        expect(normalizeUniqueValue("Text", "  Acme  ")).toBe("acme");
        expect(normalizeStoredUniqueValue("Text", "  Acme  ")).toBe("acme");
    });

    it("returns null for empty values", () => {
        expect(normalizeUniqueValue("Text", "   ")).toBeNull();
        expect(normalizeStoredUniqueValue("Text", " ")).toBeNull();
    });
});
