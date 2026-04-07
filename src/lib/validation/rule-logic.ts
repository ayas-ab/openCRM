import { getDateTimeTimestamp, getTemporalComparableValue } from "@/lib/temporal";

export type RuleCriteriaFilter = {
    fieldDefId?: number;
    field?: string;
    operator?: string;
    value?: string;
};

export type RuleCriteria = {
    logic?: "ALL" | "ANY" | "CUSTOM";
    expression?: string;
    filters?: RuleCriteriaFilter[];
};

export const characterLengthOperators = new Set([
    "character_length_lt",
    "character_length_lte",
    "character_length_eq",
    "character_length_gte",
    "character_length_gt",
]);

type LogicTokenType = "NUMBER" | "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN" | "EOF";

type LogicToken = {
    type: LogicTokenType;
    value?: number;
};

export type CustomLogicValidationResult = {
    valid: boolean;
    message: string;
    normalized?: string;
};

function tokenizeCustomLogicExpression(expression: string): LogicToken[] {
    const tokens: LogicToken[] = [];
    let index = 0;

    while (index < expression.length) {
        const remaining = expression.slice(index);

        const whitespaceMatch = remaining.match(/^\s+/);
        if (whitespaceMatch) {
            index += whitespaceMatch[0].length;
            continue;
        }

        if (remaining.startsWith("&&")) {
            tokens.push({ type: "AND" });
            index += 2;
            continue;
        }

        if (remaining.startsWith("||")) {
            tokens.push({ type: "OR" });
            index += 2;
            continue;
        }

        if (remaining.startsWith("!")) {
            tokens.push({ type: "NOT" });
            index += 1;
            continue;
        }

        if (remaining.startsWith("(")) {
            tokens.push({ type: "LPAREN" });
            index += 1;
            continue;
        }

        if (remaining.startsWith(")")) {
            tokens.push({ type: "RPAREN" });
            index += 1;
            continue;
        }

        const numberMatch = remaining.match(/^\d+/);
        if (numberMatch) {
            tokens.push({ type: "NUMBER", value: parseInt(numberMatch[0], 10) });
            index += numberMatch[0].length;
            continue;
        }

        const wordMatch = remaining.match(/^[a-zA-Z_]+/);
        if (wordMatch) {
            const word = wordMatch[0].toUpperCase();
            if (word === "AND") {
                tokens.push({ type: "AND" });
            } else if (word === "OR") {
                tokens.push({ type: "OR" });
            } else if (word === "NOT") {
                tokens.push({ type: "NOT" });
            } else {
                throw new Error(`Unsupported token "${wordMatch[0]}"`);
            }
            index += wordMatch[0].length;
            continue;
        }

        throw new Error(`Invalid token at index ${index}`);
    }

    tokens.push({ type: "EOF" });
    return tokens;
}

class CustomLogicParser {
    private tokens: LogicToken[];
    private position = 0;
    private matches: boolean[];

    constructor(tokens: LogicToken[], matches: boolean[]) {
        this.tokens = tokens;
        this.matches = matches;
    }

    parse(): boolean {
        const result = this.parseOrExpression();
        this.expect("EOF");
        return result;
    }

    private current(): LogicToken {
        return this.tokens[this.position] ?? { type: "EOF" };
    }

    private consume(expectedType: LogicTokenType): LogicToken {
        const token = this.current();
        if (token.type !== expectedType) {
            throw new Error(`Expected ${expectedType} but found ${token.type}`);
        }
        this.position += 1;
        return token;
    }

    private expect(expectedType: LogicTokenType) {
        this.consume(expectedType);
    }

    private match(tokenType: LogicTokenType): boolean {
        if (this.current().type === tokenType) {
            this.position += 1;
            return true;
        }
        return false;
    }

    private parseOrExpression(): boolean {
        let value = this.parseAndExpression();
        while (this.match("OR")) {
            const right = this.parseAndExpression();
            value = value || right;
        }
        return value;
    }

    private parseAndExpression(): boolean {
        let value = this.parseNotExpression();
        while (this.match("AND")) {
            const right = this.parseNotExpression();
            value = value && right;
        }
        return value;
    }

    private parseNotExpression(): boolean {
        if (this.match("NOT")) {
            return !this.parseNotExpression();
        }
        return this.parsePrimaryExpression();
    }

    private parsePrimaryExpression(): boolean {
        if (this.match("LPAREN")) {
            const value = this.parseOrExpression();
            this.expect("RPAREN");
            return value;
        }

        const token = this.consume("NUMBER");
        const conditionIndex = (token.value ?? 0) - 1;
        if (conditionIndex < 0 || conditionIndex >= this.matches.length) {
            return false;
        }
        return Boolean(this.matches[conditionIndex]);
    }
}

type FieldValueContainer = {
    valueText?: string | null;
    valueNumber?: { toString(): string } | null;
    valueDate?: Date | null;
    valueBoolean?: boolean | null;
    valueLookup?: number | null;
    valuePicklistId?: number | null;
};

function normalizeBooleanValue(value: FieldValueContainer | null | undefined) {
    if (!value) return null;
    if (value.valueBoolean !== null && value.valueBoolean !== undefined) return value.valueBoolean;
    if (value.valueText === "true") return true;
    if (value.valueText === "false") return false;
    return null;
}

export function getComparableFieldValue(fieldType: string, value: FieldValueContainer | null | undefined) {
    if (!value) return null;
    switch (fieldType) {
        case "Number":
        case "Currency":
            return value.valueNumber ? value.valueNumber.toString() : null;
        case "Date":
        case "DateTime":
            return value.valueDate ? getTemporalComparableValue(fieldType, value.valueDate) : null;
        case "Checkbox":
            return normalizeBooleanValue(value);
        case "Lookup":
            if (value.valueLookup !== null && value.valueLookup !== undefined) return value.valueLookup;
            if (value.valueText) {
                const parsed = parseInt(value.valueText, 10);
                return Number.isNaN(parsed) ? null : parsed;
            }
            return null;
        case "Picklist":
            return value.valuePicklistId ?? null;
        default:
            return value.valueText ?? null;
    }
}

export function coerceFieldValue(fieldType: string, rawValue: any) {
    if (rawValue === undefined || rawValue === null) return null;
    switch (fieldType) {
        case "Number":
        case "Currency": {
            const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue);
            return isNaN(value) ? null : value;
        }
        case "Date": {
            return getTemporalComparableValue(fieldType, rawValue);
        }
        case "DateTime": {
            return getDateTimeTimestamp(rawValue);
        }
        case "Picklist": {
            const parsed = typeof rawValue === "number" ? rawValue : parseInt(String(rawValue), 10);
            return Number.isNaN(parsed) ? null : parsed;
        }
        case "Checkbox":
            if (typeof rawValue === "boolean") return rawValue;
            if (typeof rawValue === "string") {
                return rawValue === "true" || rawValue === "1";
            }
            return Boolean(rawValue);
        default:
            return String(rawValue);
    }
}

export function buildExpressionContext(valueMap: Record<string, any>) {
    const context: Record<string, any> = {};
    Object.entries(valueMap).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            context[key] = null;
        } else if (typeof value === "number" || typeof value === "boolean") {
            context[key] = value;
        } else if (value instanceof Date) {
            context[key] = value.getTime();
        } else {
            context[key] = value;
            const numericValue = Number(value);
            if (!Number.isNaN(numericValue)) {
                context[`${key}_num`] = numericValue;
            }
        }
    });
    return context;
}

export function evaluateOperator(left: any, right: any, operator: string) {
    if (characterLengthOperators.has(operator)) {
        const leftLength = left === null || left === undefined ? 0 : String(left).length;
        const rightNumber = typeof right === "number" ? right : Number(right);
        if (!Number.isFinite(rightNumber)) return false;
        switch (operator) {
            case "character_length_lt":
                return leftLength < rightNumber;
            case "character_length_lte":
                return leftLength <= rightNumber;
            case "character_length_eq":
                return leftLength === rightNumber;
            case "character_length_gte":
                return leftLength >= rightNumber;
            case "character_length_gt":
                return leftLength > rightNumber;
            default:
                return false;
        }
    }
    if (left === null || right === null) {
        return operator === "is_blank" ? left === null : operator === "is_not_blank" ? left !== null : false;
    }

    switch (operator) {
        case "equals":
            return left === right;
        case "not_equals":
            return left !== right;
        case "gt":
            return typeof left === "number" && typeof right === "number" && left > right;
        case "gte":
            return typeof left === "number" && typeof right === "number" && left >= right;
        case "lt":
            return typeof left === "number" && typeof right === "number" && left < right;
        case "lte":
            return typeof left === "number" && typeof right === "number" && left <= right;
        case "contains":
            return typeof left === "string" && typeof right === "string" && left.toLowerCase().includes(right.toLowerCase());
        case "not_contains":
            return typeof left === "string" && typeof right === "string" && !left.toLowerCase().includes(right.toLowerCase());
        case "is_blank":
            return left === null || left === "";
        case "is_not_blank":
            return !(left === null || left === "");
        default:
            return false;
    }
}

export function normalizeCriteria(criteria: RuleCriteria | RuleCriteriaFilter[] | null | undefined) {
    if (!criteria) {
        return { logic: "ALL" as const, filters: [] };
    }

    if (Array.isArray(criteria)) {
        return { logic: "ALL" as const, filters: criteria };
    }

    const logic = criteria.logic === "CUSTOM" ? "CUSTOM" : criteria.logic === "ANY" ? "ANY" : "ALL";
    const filters = Array.isArray(criteria.filters) ? criteria.filters : [];
    const expression = typeof criteria.expression === "string" ? criteria.expression : undefined;
    return { logic, filters, expression };
}

export function evaluateCustomLogicExpression(expression: string, matches: boolean[]) {
    try {
        const tokens = tokenizeCustomLogicExpression(expression);
        const parser = new CustomLogicParser(tokens, matches);
        return parser.parse();
    } catch (error) {
        console.warn("Custom logic evaluation error:", error);
        return null;
    }
}

export function filterCandidateIdsByCustomLogicMatches(
    candidateIds: number[],
    filterSets: Array<Set<number>>,
    expression: string
) {
    const results: number[] = [];
    for (const id of candidateIds) {
        const matches = filterSets.map((set) => set.has(id));
        const passes = evaluateCustomLogicExpression(expression, matches);
        if (passes) results.push(id);
    }
    return results;
}

export function validateCustomLogicExpressionInput(
    expression: string | undefined,
    conditionCount: number,
    example = "(1 AND 2) OR 3"
): CustomLogicValidationResult {
    if (!expression || !expression.trim()) {
        return {
            valid: false,
            message: `Enter a custom logic expression (e.g. ${example}).`,
        };
    }

    const sanitized = expression.trim();
    if (/&&|\|\||!/.test(sanitized)) {
        return {
            valid: false,
            message: "Use AND, OR, NOT keywords only. Symbols like &&, ||, ! are not allowed.",
        };
    }

    const normalized = sanitized
        .replace(/\bAND\b/gi, " AND ")
        .replace(/\bOR\b/gi, " OR ")
        .replace(/\bNOT\b/gi, " NOT ")
        .replace(/\s+/g, " ")
        .trim();

    if (/[^0-9A-Za-z\s\(\)]/.test(normalized)) {
        return {
            valid: false,
            message: "Expression can only contain condition numbers, parentheses, and AND/OR/NOT.",
        };
    }

    const leftoverTokens = normalized
        .replace(/\b(AND|OR|NOT)\b/gi, " ")
        .replace(/[0-9\s\(\)]/g, "")
        .trim();
    if (leftoverTokens.length > 0) {
        return {
            valid: false,
            message: "Expression can only contain condition numbers, parentheses, and AND/OR/NOT.",
        };
    }

    const references = Array.from(new Set((normalized.match(/\d+/g) || []).map((n) => parseInt(n, 10))));
    if (references.some((n) => n < 1 || n > conditionCount)) {
        return {
            valid: false,
            message: "Expression references a condition number that does not exist.",
        };
    }

    try {
        const tokens = tokenizeCustomLogicExpression(normalized);
        const parser = new CustomLogicParser(tokens, new Array(Math.max(conditionCount, 1)).fill(true));
        parser.parse();
    } catch {
        return {
            valid: false,
            message: "Expression is incomplete or malformed. Check parentheses and operators.",
        };
    }

    return { valid: true, message: "", normalized };
}

export function normalizeCustomLogicExpressionOrThrow(
    expression: string | undefined,
    conditionCount: number,
    example?: string
) {
    const result = validateCustomLogicExpressionInput(expression, conditionCount, example);
    if (!result.valid || !result.normalized) {
        throw new Error(result.message);
    }
    return result.normalized;
}
