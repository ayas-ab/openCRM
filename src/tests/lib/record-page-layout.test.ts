import { describe, expect, it } from "vitest";
import { normalizeRecordPageLayoutConfig } from "@/lib/record-page-layout";

describe("record page layout custom visibility validation", () => {
    it("throws when custom section expressions are malformed", () => {
        expect(() =>
            normalizeRecordPageLayoutConfig(
                {
                    version: 2,
                    highlights: { columns: 4, fields: [] },
                    sections: [
                        {
                            id: "details",
                            title: "Details",
                            columns: 2,
                            visibility: {
                                mode: "CUSTOM",
                                expression: "1(",
                                filters: [{ fieldDefId: 1, field: "name", operator: "equals", value: "test" }],
                            },
                            items: [{ type: "field", fieldId: 1, col: 1 }],
                        },
                    ],
                },
                [{ id: 1, required: false, type: "Text" }]
            )
        ).toThrow(
            "Expression is incomplete or malformed. Check parentheses and operators."
        );
    });
});
