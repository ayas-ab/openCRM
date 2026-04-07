import { FieldDefinition } from "@prisma/client";
import { z } from "zod";
import { parseDateOnlyValue, parseDateTimeValue } from "@/lib/temporal";

export function validateRecordData(
    fieldDefs: FieldDefinition[],
    data: Record<string, any>,
    validationOptions?: { ignoreMissingRequired?: boolean }
) {
    const errors: Record<string, string> = {};
    for (const field of fieldDefs) {
        const value = data[field.apiName];
        const options = field.options && !Array.isArray(field.options) ? (field.options as any) : {};

        // 1. Check Required
        if (
            field.type !== "File" &&
            field.type !== "AutoNumber" &&
            field.required &&
            (value === undefined || value === null || value === "")
        ) {
            if (validationOptions?.ignoreMissingRequired && !(field.apiName in data)) {
                continue;
            }
            errors[field.apiName] = `${field.label} is required`;
            continue;
        }

        // Skip validation if value is empty and not required
        if (value === undefined || value === null || value === "") {
            continue;
        }

        // 2. Check Types
        switch (field.type) {
            case "Number":
                if (isNaN(Number(value))) {
                    errors[field.apiName] = `${field.label} must be a number`;
                } else if (typeof options?.decimalPlaces === "number") {
                    const decimalPlaces = Math.max(0, Math.floor(options.decimalPlaces));
                    const stringValue = String(value);
                    const [, decimals = ""] = stringValue.split(".");
                    if (decimals.length > decimalPlaces) {
                        errors[field.apiName] = `${field.label} must have ${decimalPlaces} decimal places or fewer`;
                    }
                }
                break;
            case "Date":
                if (!parseDateOnlyValue(value)) {
                    errors[field.apiName] = `${field.label} must be a valid date`;
                }
                break;
            case "DateTime":
                if (!parseDateTimeValue(value)) {
                    errors[field.apiName] = `${field.label} must be a valid date`;
                }
                break;
            case "Email":
                const emailSchema = z.string().email();
                const emailResult = emailSchema.safeParse(value);
                if (!emailResult.success) {
                    errors[field.apiName] = `${field.label} must be a valid email`;
                }
                break;
            case "Url":
                const urlSchema = z.string().url();
                const urlResult = urlSchema.safeParse(value);
                if (!urlResult.success) {
                    errors[field.apiName] = `${field.label} must be a valid URL`;
                }
                break;
            case "Phone":
                const phoneRegex = /^\+?[0-9]{10,15}$/;
                if (!phoneRegex.test(String(value))) {
                    errors[field.apiName] = `${field.label} must be a valid phone number`;
                }
                break;
            case "Picklist":
                const picklistOptions = (field as any).picklistOptions as
                    | { id: number; label: string; isActive: boolean }[]
                    | undefined;
                if (!picklistOptions || picklistOptions.length === 0) {
                    errors[field.apiName] = `${field.label} has no available options`;
                    break;
                }
                // Picklist values are stored by option id; validate the chosen id exists and is active.
                const picklistId = Number(value);
                const match = picklistOptions.find((opt) => opt.id === picklistId);
                if (!match) {
                    errors[field.apiName] = `${field.label} must be a valid option`;
                } else if (!match.isActive) {
                    errors[field.apiName] = `${field.label} uses an inactive option`;
                }
                break;
            case "File":
            case "AutoNumber":
                break;
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new Error(JSON.stringify(errors));
    }

    return true;
}
