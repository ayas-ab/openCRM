export function normalizePhoneValue(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    return digits.length > 0 ? digits : null;
}

export function normalizeUniqueValue(fieldType: string, rawValue: any) {
    if (rawValue === undefined || rawValue === null) return null;
    const stringValue = String(rawValue).trim();
    if (!stringValue) return null;

    if (fieldType === "Phone") {
        return normalizePhoneValue(stringValue);
    }

    return stringValue.toLowerCase();
}

export function normalizeStoredUniqueValue(
    fieldType: string,
    valueText?: string | null,
    valueSearch?: string | null
) {
    if (fieldType === "Phone") {
        const source = valueText ?? valueSearch ?? "";
        return normalizePhoneValue(source);
    }

    const source = valueSearch ?? valueText ?? "";
    const normalized = source.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}
