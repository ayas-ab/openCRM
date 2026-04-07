const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function buildUtcDate(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month - 1, day));
}

function isValidDateParts(year: number, month: number, day: number) {
    const date = buildUtcDate(year, month, day);
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export function isTemporalFieldType(fieldType: string) {
    return fieldType === "Date" || fieldType === "DateTime";
}

export function isDateOnlyFieldType(fieldType: string) {
    return fieldType === "Date";
}

export function isDateTimeFieldType(fieldType: string) {
    return fieldType === "DateTime";
}

export function getDateOnlyKey(rawValue: unknown): string | null {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (!trimmed) return null;

        const exactMatch = trimmed.match(DATE_ONLY_PATTERN);
        if (exactMatch) {
            const year = Number(exactMatch[1]);
            const month = Number(exactMatch[2]);
            const day = Number(exactMatch[3]);
            return isValidDateParts(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
        }

        const leadingMatch = trimmed.slice(0, 10).match(DATE_ONLY_PATTERN);
        if (leadingMatch) {
            const year = Number(leadingMatch[1]);
            const month = Number(leadingMatch[2]);
            const day = Number(leadingMatch[3]);
            return isValidDateParts(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
        }
    }

    const date = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDateOnlyValue(rawValue: unknown): Date | null {
    const key = getDateOnlyKey(rawValue);
    if (!key) return null;
    const [year, month, day] = key.split("-").map(Number);
    return buildUtcDate(year, month, day);
}

export function getDateOnlyDayNumber(rawValue: unknown): number | null {
    const date = parseDateOnlyValue(rawValue);
    if (!date) return null;
    return Math.floor(date.getTime() / MS_PER_DAY);
}

export function getDateOnlyRange(rawValue: unknown) {
    const start = parseDateOnlyValue(rawValue);
    if (!start) return null;
    return {
        start,
        nextStart: new Date(start.getTime() + MS_PER_DAY),
    };
}

export function parseDateTimeValue(rawValue: unknown): Date | null {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    const date = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getDateTimeTimestamp(rawValue: unknown): number | null {
    const date = parseDateTimeValue(rawValue);
    return date ? date.getTime() : null;
}

export function getTemporalComparableValue(fieldType: string, rawValue: unknown): number | null {
    if (fieldType === "Date") return getDateOnlyDayNumber(rawValue);
    if (fieldType === "DateTime") return getDateTimeTimestamp(rawValue);
    return null;
}

export function formatDateOnlyForInput(rawValue: unknown) {
    return getDateOnlyKey(rawValue) ?? "";
}

export function formatDateTimeForInput(rawValue: unknown) {
    const date = parseDateTimeValue(rawValue);
    if (!date) return "";
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateOnlyForDisplay(rawValue: unknown, locale: string | string[] | undefined = undefined) {
    const key = getDateOnlyKey(rawValue);
    if (!key) return null;
    const [year, month, day] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        timeZone: "UTC",
    }).format(buildUtcDate(year, month, day));
}

export function formatDateTimeForDisplay(rawValue: unknown, locale: string | string[] | undefined = undefined) {
    const date = parseDateTimeValue(rawValue);
    if (!date) return null;
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}
