import { describe, expect, it } from "vitest";
import { buildAutoNumberValue, parseAutoNumberOptions } from "@/lib/auto-number";

describe("auto-number", () => {
    it("builds values with prefix and padding", () => {
        const value = buildAutoNumberValue({ prefix: "TKT-", minDigits: 4, nextValue: 7 });
        expect(value).toBe("TKT-0007");
    });

    it("handles missing config defaults", () => {
        const options = parseAutoNumberOptions(null);
        expect(options).toEqual({});
    });
});
