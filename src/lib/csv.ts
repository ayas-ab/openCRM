const FORMULA_PREFIX_PATTERN = /^[\t ]*[=+\-@]/;

export function sanitizeCsvFormula(value: string): string {
    if (FORMULA_PREFIX_PATTERN.test(value)) {
        return `'${value}`;
    }

    return value;
}

export function escapeCsv(value: string): string {
    if (value.includes('"')) {
        value = value.replace(/"/g, '""');
    }

    if (value.includes(",") || value.includes("\n") || value.includes("\r")) {
        return `"${value}"`;
    }

    return value;
}

export function formatCsvCell(value: string): string {
    return escapeCsv(sanitizeCsvFormula(value));
}
