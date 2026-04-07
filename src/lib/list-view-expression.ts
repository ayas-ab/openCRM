import { Prisma } from "@prisma/client";
import { getDateOnlyRange, parseDateOnlyValue, parseDateTimeValue } from "@/lib/temporal";

export const LIST_VIEW_SEARCH_TYPES = new Set(["Text", "Email", "Phone", "Url"]);
export const UNSUPPORTED_LIST_VIEW_TYPES = new Set(["TextArea", "File"]);

export type ListViewExpressionNode =
    | { type: "condition"; index: number }
    | { type: "not"; node: ListViewExpressionNode }
    | { type: "and" | "or"; left: ListViewExpressionNode; right: ListViewExpressionNode };

export function tokenizeListViewExpression(expression: string) {
    const normalized = expression
        .replace(/\bAND\b/gi, "&&")
        .replace(/\bOR\b/gi, "||")
        .replace(/\bNOT\b/gi, "!");
    const compact = normalized.replace(/\s+/g, "");
    if (!compact) return null;
    const tokens = compact.match(/(\d+|&&|\|\||!|\(|\))/g);
    if (!tokens) return null;
    if (tokens.join("") !== compact) return null;
    return tokens;
}

export function parseListViewExpression(tokens: string[]) {
    let index = 0;

    const peek = () => tokens[index];
    const consume = () => tokens[index++];

    const parsePrimary = (): ListViewExpressionNode => {
        const token = peek();
        if (!token) {
            throw new Error("Unexpected end of expression.");
        }
        if (token === "(") {
            consume();
            const node = parseOr();
            if (peek() !== ")") {
                throw new Error("Missing closing parenthesis.");
            }
            consume();
            return node;
        }
        if (/^\d+$/.test(token)) {
            consume();
            return { type: "condition", index: parseInt(token, 10) };
        }
        throw new Error(`Unexpected token: ${token}`);
    };

    const parseNot = (): ListViewExpressionNode => {
        if (peek() === "!") {
            consume();
            return { type: "not", node: parseNot() };
        }
        return parsePrimary();
    };

    const parseAnd = (): ListViewExpressionNode => {
        let node = parseNot();
        while (peek() === "&&") {
            consume();
            node = { type: "and", left: node, right: parseNot() };
        }
        return node;
    };

    const parseOr = (): ListViewExpressionNode => {
        let node = parseAnd();
        while (peek() === "||") {
            consume();
            node = { type: "or", left: node, right: parseAnd() };
        }
        return node;
    };

    const root = parseOr();
    if (index < tokens.length) {
        throw new Error(`Unexpected token: ${peek()}`);
    }
    return root;
}

export function validateListViewExpression(node: ListViewExpressionNode, maxIndex: number): boolean {
    if (node.type === "condition") {
        return node.index >= 1 && node.index <= maxIndex;
    }
    if (node.type === "not") {
        return validateListViewExpression(node.node, maxIndex);
    }
    return (
        validateListViewExpression(node.left, maxIndex) &&
        validateListViewExpression(node.right, maxIndex)
    );
}

export function buildListViewExpressionFilter(
    node: ListViewExpressionNode,
    conditions: Array<Prisma.RecordWhereInput | null>
): Prisma.RecordWhereInput | null {
    if (node.type === "condition") {
        return conditions[node.index - 1] ?? null;
    }
    if (node.type === "not") {
        const inner = buildListViewExpressionFilter(node.node, conditions);
        return inner ? ({ NOT: inner } satisfies Prisma.RecordWhereInput) : null;
    }
    const left = buildListViewExpressionFilter(node.left, conditions);
    const right = buildListViewExpressionFilter(node.right, conditions);
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    return node.type === "and"
        ? ({ AND: [left, right] } satisfies Prisma.RecordWhereInput)
        : ({ OR: [left, right] } satisfies Prisma.RecordWhereInput);
}

export function buildListViewExpressionSql(
    node: ListViewExpressionNode,
    clauses: Array<Prisma.Sql | null>
): Prisma.Sql | null {
    if (node.type === "condition") {
        return clauses[node.index - 1] ?? null;
    }
    if (node.type === "not") {
        const inner = buildListViewExpressionSql(node.node, clauses);
        return inner ? Prisma.sql`(NOT ${inner})` : null;
    }
    const left = buildListViewExpressionSql(node.left, clauses);
    const right = buildListViewExpressionSql(node.right, clauses);
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    return node.type === "and"
        ? Prisma.sql`(${left} AND ${right})`
        : Prisma.sql`(${left} OR ${right})`;
}

export function parseListViewValue(fieldType: string, rawValue: string | undefined) {
    if (rawValue === undefined || rawValue === null) return null;

    switch (fieldType) {
        case "Number":
        case "Currency": {
            const numeric = Number(rawValue);
            return Number.isNaN(numeric) ? null : new Prisma.Decimal(numeric);
        }
        case "Date": {
            return parseDateOnlyValue(rawValue);
        }
        case "DateTime": {
            return parseDateTimeValue(rawValue);
        }
        case "Picklist": {
            const picklistId = parseInt(rawValue, 10);
            return Number.isNaN(picklistId) ? null : picklistId;
        }
        case "Checkbox":
            return rawValue === "true" || rawValue === "1";
        case "Lookup": {
            const lookupId = parseInt(rawValue, 10);
            return Number.isNaN(lookupId) ? null : lookupId;
        }
        default:
            return rawValue;
    }
}

export function buildListViewFieldFilter(fieldDef: { id: number; type: string }, operator: string, value?: string) {
    const fieldDefId = fieldDef.id;
    if (UNSUPPORTED_LIST_VIEW_TYPES.has(fieldDef.type)) {
        return null;
    }
    const valueColumn =
        fieldDef.type === "Number" || fieldDef.type === "Currency"
            ? "valueNumber"
            : fieldDef.type === "Date" || fieldDef.type === "DateTime"
                ? "valueDate"
                : fieldDef.type === "Checkbox"
                    ? "valueBoolean"
                    : fieldDef.type === "Lookup"
                        ? "valueLookup"
                        : fieldDef.type === "Picklist"
                            ? "valuePicklistId"
                            : "valueText";

    if (operator === "is_blank") {
        return {
            OR: [
                { fields: { none: { fieldDefId } } },
                { fields: { some: { fieldDefId, [valueColumn]: null } } },
            ],
        } satisfies Prisma.RecordWhereInput;
    }

    if (operator === "is_not_blank") {
        return {
            fields: {
                some: {
                    fieldDefId,
                    [valueColumn]: { not: null },
                },
            },
        } satisfies Prisma.RecordWhereInput;
    }

    if (operator === "contains" || operator === "not_contains") {
        if (fieldDef.type === "Picklist") return null;
        const trimmed = (value ?? "").trim();
        if (!trimmed) return null;
        const predicate = LIST_VIEW_SEARCH_TYPES.has(fieldDef.type)
            ? { valueSearch: { contains: trimmed.toLowerCase() } }
            : { valueText: { contains: trimmed, mode: "insensitive" as const } };
        const base = {
            fields: {
                some: {
                    fieldDefId,
                    ...predicate,
                },
            },
        } satisfies Prisma.RecordWhereInput;
        return operator === "not_contains" ? { NOT: base } : base;
    }

    const parsedValue = parseListViewValue(fieldDef.type, value);
    if (parsedValue === null) return null;

    if (valueColumn === "valueText" && typeof parsedValue === "string") {
        const normalized = parsedValue.trim();
        if (!normalized) return null;
        const textFilter = LIST_VIEW_SEARCH_TYPES.has(fieldDef.type)
            ? { valueSearch: normalized.toLowerCase() }
            : { valueText: { equals: normalized, mode: "insensitive" as const } };
        const base = {
            fields: {
                some: {
                    fieldDefId,
                    ...textFilter,
                },
            },
        } satisfies Prisma.RecordWhereInput;
        return operator === "not_equals" ? ({ NOT: base } satisfies Prisma.RecordWhereInput) : base;
    }

    if (fieldDef.type === "Date") {
        const range = getDateOnlyRange(parsedValue);
        if (!range) return null;
        const base =
            operator === "equals"
                ? {
                    fields: {
                        some: {
                            fieldDefId,
                            valueDate: {
                                gte: range.start,
                                lt: range.nextStart,
                            },
                        },
                    },
                }
                : operator === "not_equals"
                    ? ({
                        OR: [
                            { fields: { none: { fieldDefId } } },
                            {
                                fields: {
                                    some: {
                                        fieldDefId,
                                        OR: [
                                            { valueDate: { lt: range.start } },
                                            { valueDate: { gte: range.nextStart } },
                                        ],
                                    },
                                },
                            },
                        ],
                    } satisfies Prisma.RecordWhereInput)
                    : {
                        fields: {
                            some: {
                                fieldDefId,
                                valueDate:
                                    operator === "gt"
                                        ? { gte: range.nextStart }
                                        : operator === "gte"
                                            ? { gte: range.start }
                                            : operator === "lt"
                                                ? { lt: range.start }
                                                : { lt: range.nextStart },
                            },
                        },
                    };
        return base satisfies Prisma.RecordWhereInput;
    }

    const comparator =
        operator === "gt"
            ? { gt: parsedValue }
            : operator === "gte"
                ? { gte: parsedValue }
                : operator === "lt"
                    ? { lt: parsedValue }
                    : operator === "lte"
                        ? { lte: parsedValue }
                        : parsedValue;

    const base = {
        fields: {
            some: {
                fieldDefId,
                [valueColumn]: comparator,
            },
        },
    } satisfies Prisma.RecordWhereInput;

    return operator === "not_equals" ? ({ NOT: base } satisfies Prisma.RecordWhereInput) : base;
}
