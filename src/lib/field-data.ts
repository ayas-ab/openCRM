import { FieldData, FieldDefinition, Prisma } from "@prisma/client";
import { normalizePhoneValue } from "@/lib/unique";
import {
    formatDateOnlyForInput,
    isDateOnlyFieldType,
    isDateTimeFieldType,
    parseDateOnlyValue,
    parseDateTimeValue,
} from "@/lib/temporal";
type FieldValuePayload = {
    valueText: string | null;
    valueSearch: string | null;
    valueNumber: Prisma.Decimal | null;
    valueDate: Date | null;
    valueBoolean: boolean | null;
    valueLookup: number | null;
    valuePicklistId: number | null;
};

type FieldValueSource = Pick<
    FieldData,
    "valueText" | "valueNumber" | "valueDate" | "valueBoolean" | "valueLookup" | "valuePicklistId"
> & {
    fieldDef?: { type?: string | null } | null;
    valuePicklist?: { id: number; label: string } | null;
};

const SEARCHABLE_FIELD_TYPES = new Set(["Text", "Email", "Phone", "Url", "AutoNumber"]);

export function buildFieldDataPayload(field: FieldDefinition, rawValue: any): FieldValuePayload {
    const normalizedValue = rawValue === undefined ? null : rawValue;
    const stringValue = normalizedValue === null ? null : String(normalizedValue);
    const trimmedValue = stringValue?.trim() ?? null;
    const options = field.options && !Array.isArray(field.options) ? (field.options as any) : {};
    const decimalPlaces =
        options && typeof options.decimalPlaces === "number" && Number.isFinite(options.decimalPlaces)
            ? Math.max(0, Math.floor(options.decimalPlaces))
            : undefined;

    const payload: FieldValuePayload = {
        valueText: trimmedValue ?? stringValue,
        valueSearch: null,
        valueNumber: null,
        valueDate: null,
        valueBoolean: null,
        valueLookup: null,
        valuePicklistId: null,
    };

    if (payload.valueText === "") {
        payload.valueText = null;
    }

    if (SEARCHABLE_FIELD_TYPES.has(field.type) && payload.valueText) {
        payload.valueSearch = payload.valueText.toLowerCase().slice(0, 191);
        if (field.type === "Phone") {
            const normalizedPhone = normalizePhoneValue(payload.valueText);
            if (normalizedPhone) {
                payload.valueSearch = normalizedPhone.slice(0, 191);
            }
        }
    }

    if (field.type === "File") {
        payload.valueText = null;
        return payload;
    }

    if (field.type === "Picklist") {
        // Picklist values are stored by option id for CRM-grade consistency.
        if (normalizedValue === "" || normalizedValue === null) {
            payload.valuePicklistId = null;
            payload.valueText = null;
            payload.valueSearch = null;
            return payload;
        }
        const picklistId = Number(normalizedValue);
        payload.valuePicklistId = Number.isFinite(picklistId) ? picklistId : null;
        payload.valueText = null;
        payload.valueSearch = null;
        return payload;
    }

    if (payload.valueText === null) {
        return payload;
    }

    switch (field.type) {
        case "Number":
            try {
                let numeric = new Prisma.Decimal(payload.valueText);
                if (decimalPlaces !== undefined) {
                    const rounded = numeric.toFixed(decimalPlaces);
                    numeric = new Prisma.Decimal(rounded);
                    payload.valueText = numeric.toString();
                }
                payload.valueNumber = numeric;
            } catch {
                payload.valueNumber = null;
            }
            break;
        case "Date": {
            const date = parseDateOnlyValue(payload.valueText);
            if (date) {
                payload.valueDate = date;
                payload.valueText = formatDateOnlyForInput(date);
            }
            break;
        }
        case "DateTime": {
            const date = parseDateTimeValue(payload.valueText);
            if (date) {
                payload.valueDate = date;
                payload.valueText = date.toISOString();
            }
            break;
        }
        case "Checkbox":
            payload.valueBoolean = normalizedValue === true || normalizedValue === "true" || normalizedValue === "1";
            payload.valueText = payload.valueBoolean ? "true" : "false";
            break;
        case "Lookup": {
            const lookupId = typeof normalizedValue === "number" ? normalizedValue : parseInt(payload.valueText, 10);
            payload.valueLookup = isNaN(lookupId) ? null : lookupId;
            break;
        }
    }

    return payload;
}

export function getFieldDisplayValue(fieldData?: FieldValueSource | null): string | null {
    if (!fieldData) return null;
    if (fieldData.valuePicklistId !== null && fieldData.valuePicklistId !== undefined) {
        return String(fieldData.valuePicklistId);
    }
    const fieldType = (fieldData as { fieldDef?: { type?: string | null } | null }).fieldDef?.type ?? null;
    if (fieldData.valueDate) {
        if (isDateOnlyFieldType(fieldType ?? "")) {
            return formatDateOnlyForInput(fieldData.valueDate);
        }
        if (isDateTimeFieldType(fieldType ?? "")) {
            return fieldData.valueDate.toISOString();
        }
    }
    if (fieldData.valueText !== null && fieldData.valueText !== undefined) return fieldData.valueText;
    if (fieldData.valueNumber !== null && fieldData.valueNumber !== undefined) return fieldData.valueNumber.toString();
    if (fieldData.valueBoolean !== null && fieldData.valueBoolean !== undefined) return fieldData.valueBoolean ? "true" : "false";
    if (fieldData.valueLookup !== null && fieldData.valueLookup !== undefined) return String(fieldData.valueLookup);
    return null;
}

export function getFieldNumericValue(fieldData?: FieldValueSource | null): number | null {
    if (!fieldData) return null;
    if (fieldData.valueNumber !== null && fieldData.valueNumber !== undefined) {
        return Number(fieldData.valueNumber);
    }
    if (fieldData.valueText) {
        const parsed = parseFloat(fieldData.valueText);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}

export function getLookupId(fieldData?: FieldValueSource | null): number | null {
    if (!fieldData) return null;
    if (fieldData.valueLookup !== null && fieldData.valueLookup !== undefined) {
        return fieldData.valueLookup;
    }
    if (fieldData.valueText) {
        const parsed = parseInt(fieldData.valueText, 10);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}

export function getPrimaryNameField(fields: FieldDefinition[]) {
    return fields.find(f => f.apiName === "name") || fields.find(f => f.type === "Text");
}

export function deriveRecordName(fields: FieldDefinition[], values: Record<string, any>): string | null {
    const primaryField = getPrimaryNameField(fields);
    if (!primaryField) return null;

    const rawValue = values[primaryField.apiName];
    if (rawValue === undefined || rawValue === null) return null;

    const stringValue = String(rawValue).trim();
    if (!stringValue) return null;

    return stringValue.slice(0, 191);
}
