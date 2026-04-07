export function normalizePicklistApiName(value: string) {
    return normalizeApiName(value);
}

export function normalizeApiName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
