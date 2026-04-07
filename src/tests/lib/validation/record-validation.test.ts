import { describe, expect, it } from "vitest";
import { validateRecordData } from "@/lib/validation/record-validation";
import { makeFieldDefinition } from "@/tests/utils/factories";

function getErrors(fn: () => void) {
    try {
        fn();
    } catch (error) {
        return JSON.parse((error as Error).message);
    }
    throw new Error("Expected validation error but none was thrown");
}

describe("record validation", () => {
    it("enforces required fields", () => {
        const field = makeFieldDefinition({
            apiName: "name",
            label: "Name",
            type: "Text",
            required: true,
        });

        const errors = getErrors(() => validateRecordData([field], {}));
        expect(errors).toMatchObject({ name: "Name is required" });
    });

    it("enforces numeric decimal places", () => {
        const field = makeFieldDefinition({
            apiName: "amount",
            label: "Amount",
            type: "Number",
            options: { decimalPlaces: 2 },
        });

        const errors = getErrors(() =>
            validateRecordData([field], { amount: "10.234" })
        );
        expect(errors).toMatchObject({ amount: "Amount must have 2 decimal places or fewer" });
    });

    it("validates email, url, and phone", () => {
        const email = makeFieldDefinition({ apiName: "email", label: "Email", type: "Email" });
        const url = makeFieldDefinition({ apiName: "site", label: "Site", type: "Url" });
        const phone = makeFieldDefinition({ apiName: "phone", label: "Phone", type: "Phone" });

        const errors = getErrors(() =>
            validateRecordData([email, url, phone], {
                email: "not-an-email",
                site: "notaurl",
                phone: "abc",
            })
        );

        expect(errors).toMatchObject({
            email: "Email must be a valid email",
            site: "Site must be a valid URL",
            phone: "Phone must be a valid phone number",
        });
    });

    it("validates picklist options", () => {
        const picklist = makeFieldDefinition({
            apiName: "status",
            label: "Status",
            type: "Picklist",
        });
        (picklist as any).picklistOptions = [{ id: 1, label: "Open", isActive: false }];

        const inactiveErrors = getErrors(() =>
            validateRecordData([picklist], { status: 1 })
        );
        expect(inactiveErrors).toMatchObject({ status: "Status uses an inactive option" });

        const missingErrors = getErrors(() =>
            validateRecordData([picklist], { status: 2 })
        );
        expect(missingErrors).toMatchObject({ status: "Status must be a valid option" });
    });
});
