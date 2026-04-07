import { z } from "zod";
import {
    evaluateCustomLogicExpression,
    normalizeCustomLogicExpressionOrThrow,
    validateCustomLogicExpressionInput,
} from "@/lib/validation/rule-logic";

const visibilityFilterSchema = z.object({
    field: z.string().optional(),
    fieldDefId: z.number().optional(),
    operator: z.string().optional(),
    value: z.string().optional(),
}).refine((data) => data.field || data.fieldDefId, {
    message: "Visibility filter requires field or fieldDefId.",
});

export const visibilityRuleSchema = z.object({
    mode: z.enum(["ALL", "ANY", "CUSTOM"]).optional(),
    logic: z.enum(["ALL", "ANY"]).optional(),
    expression: z.string().optional(),
    filters: z.array(visibilityFilterSchema).default([]),
});

const sectionItemSchema = z.object({
    type: z.literal("field"),
    fieldId: z.number(),
    col: z.number().int().min(1).max(3).optional(),
    visibility: visibilityRuleSchema.optional(),
});

const sectionSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    columns: z.number().int().min(1).max(3).default(2),
    visibility: visibilityRuleSchema.optional(),
    items: z.array(sectionItemSchema).default([]),
});

const highlightsSchema = z.object({
    columns: z.number().int().min(1).max(4).default(4),
    fields: z.array(z.number()).default([]),
});

const relatedListSchema = z.object({
    objectDefId: z.number(),
    title: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
});

const layoutConfigV2Schema = z.object({
    version: z.literal(2),
    highlights: highlightsSchema.optional(),
    sections: z.array(sectionSchema).default([]),
    relatedLists: z.array(relatedListSchema).optional(),
    systemBlocks: z
        .object({
            history: z.boolean().optional(),
            owner: z.boolean().optional(),
        })
        .optional(),
});

const layoutConfigV1Schema = z.object({
    highlights: z.array(z.number()).optional(),
    details: z.array(z.number()).optional(),
});

export const layoutConfigSchema = z.union([layoutConfigV2Schema, layoutConfigV1Schema]);

export type LayoutConfigInput = z.infer<typeof layoutConfigSchema>;
export type LayoutConfigV2 = z.infer<typeof layoutConfigV2Schema>;

type FieldLike = { id: number; required?: boolean; type?: string };
type FieldMetadata = { id: number; apiName: string; type?: string };

const clampColumns = (value: number | undefined) => {
    if (value === 1 || value === 2 || value === 3) return value;
    return 2;
};

const dedupeIds = (ids: number[]) => Array.from(new Set(ids));

const normalizeSectionItems = (items: LayoutConfigV2["sections"][number]["items"], columns: number, fieldIds: Set<number>) => {
    const filtered = items.filter((item) => fieldIds.has(item.fieldId));
    return filtered.map((item, index) => ({
        ...item,
        col: item.col && item.col >= 1 && item.col <= columns ? item.col : (index % columns) + 1,
    }));
};

const ensureRequiredFields = (
    sections: LayoutConfigV2["sections"],
    requiredIds: number[]
) => {
    const existing = new Set(sections.flatMap((section) => section.items.map((item) => item.fieldId)));
    const missing = requiredIds.filter((id) => !existing.has(id));
    if (!missing.length) return sections;
    const [first, ...rest] = sections;
    if (!first) return sections;
    const columns = clampColumns(first.columns);
    const updatedItems = [
        ...first.items,
        ...missing.map((fieldId, index) => ({
            type: "field" as const,
            fieldId,
            col: ((first.items.length + index) % columns) + 1,
        })),
    ];
    return [
        {
            ...first,
            columns,
            items: updatedItems,
        },
        ...rest,
    ];
};

const normalizeVisibilityRule = (
    visibility: z.infer<typeof visibilityRuleSchema> | undefined
) => {
    if (!visibility) return undefined;

    const filters = visibility.filters ?? [];
    const mode: "ALL" | "ANY" | "CUSTOM" =
        visibility.mode === "CUSTOM"
            ? "CUSTOM"
            : visibility.mode === "ANY" || visibility.logic === "ANY"
                ? "ANY"
                : "ALL";

    const expression =
        mode === "CUSTOM"
            ? normalizeCustomLogicExpressionOrThrow(visibility.expression, filters.length)
            : undefined;

    return {
        ...visibility,
        mode,
        expression,
        filters,
    };
};

export const buildDefaultLayoutConfig = (fields: FieldLike[]): LayoutConfigV2 => {
    const ordered = fields.map((field, index) => ({
        type: "field" as const,
        fieldId: field.id,
        col: (index % 2) + 1,
    }));
    return {
        version: 2,
        highlights: { columns: 4, fields: [] },
        sections: [
            {
                id: "details",
                title: "Details",
                columns: 2,
                items: ordered,
            },
        ],
        systemBlocks: { history: true, owner: true },
    };
};

export const normalizeRecordPageLayoutConfig = (
    input: LayoutConfigInput | null | undefined,
    fields: FieldLike[]
): LayoutConfigV2 => {
    const fieldIds = new Set(fields.map((field) => field.id));
    const disallowedHighlightTypes = new Set(["TextArea", "File"]);
    const highlightAllowedIds = new Set(
        fields
            .filter((field) => !disallowedHighlightTypes.has(field.type ?? ""))
            .map((field) => field.id)
    );
    const requiredIds = fields.filter((field) => field.required).map((field) => field.id);

    if (!input) {
        return buildDefaultLayoutConfig(fields);
    }

    if ("version" in input && input.version === 2) {
        const parsed = layoutConfigV2Schema.parse(input);
        const highlights = parsed.highlights
            ? {
                  ...parsed.highlights,
                  columns: 4,
                  fields: dedupeIds(
                      parsed.highlights.fields.filter((id) => fieldIds.has(id) && highlightAllowedIds.has(id))
                  ).slice(0, 4),
              }
            : { columns: 4, fields: [] };

        let sections: LayoutConfigV2["sections"] = parsed.sections.map((section) => {
            const columns = clampColumns(section.columns);
            return {
                ...section,
                visibility: normalizeVisibilityRule(section.visibility),
                columns,
                items: normalizeSectionItems(section.items, columns, fieldIds).map((item) => ({
                    ...item,
                    visibility: normalizeVisibilityRule(item.visibility),
                })),
            };
        });

        if (!sections.length) {
            const fallback = buildDefaultLayoutConfig(fields);
            sections = fallback.sections;
        }

        sections = ensureRequiredFields(sections, requiredIds);

        return {
            ...parsed,
            highlights,
            sections,
        };
    }

    const parsedV1 = layoutConfigV1Schema.parse(input);
    const highlightIds = dedupeIds(
        (parsedV1.highlights || []).filter((id) => fieldIds.has(id) && highlightAllowedIds.has(id))
    );
    const detailIds = dedupeIds((parsedV1.details || []).filter((id) => fieldIds.has(id)));
    const columns = 2;
    const baseItems = detailIds.map((fieldId, index) => ({
        type: "field" as const,
        fieldId,
        col: (index % columns) + 1,
    }));

    let sections: LayoutConfigV2["sections"] = [
        {
            id: "details",
            title: "Details",
            columns,
            items: baseItems,
        },
    ];

    sections = ensureRequiredFields(sections, requiredIds);

    return {
        version: 2,
        highlights: { columns: 4, fields: highlightIds.slice(0, 4) },
        sections,
        systemBlocks: { history: true, owner: true },
    };
};

type VisibilityContext = {
    recordValues: Record<string, any>;
    ownerGroupId?: number | null;
    permissionSetIds?: number[];
    fields: FieldMetadata[];
};

const operatorRequiresValue = (operator: string) => !["is_blank", "is_not_blank"].includes(operator);

const coerceFieldValue = (fieldType: string | undefined, raw: any) => {
    if (raw === undefined || raw === null || raw === "") return null;
    if (!fieldType) return raw;

    switch (fieldType) {
        case "Number":
        case "Currency": {
            const numeric = Number(raw);
            return Number.isNaN(numeric) ? null : numeric;
        }
        case "Checkbox":
            return raw === true || raw === "true";
        case "Date":
            return raw ? String(raw) : null;
        default:
            return String(raw);
    }
};

const evaluateOperator = (left: any, right: any, operator: string) => {
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
};

const resolveVisibilityMode = (visibility: z.infer<typeof visibilityRuleSchema> | undefined) => {
    if (!visibility) return "ALL";
    if (visibility.mode) return visibility.mode;
    if (visibility.logic === "ANY") return "ANY";
    return "ALL";
};

const evaluateVisibility = (visibility: z.infer<typeof visibilityRuleSchema> | undefined, context: VisibilityContext) => {
    if (!visibility || !visibility.filters.length) return true;
    const mode = resolveVisibilityMode(visibility);
    const fieldById = new Map(context.fields.map((field) => [field.id, field]));
    const fieldByApi = new Map(context.fields.map((field) => [field.apiName, field]));

    const results = visibility.filters.map((filter) => {
        const operator = filter.operator || "equals";
        if (!operatorRequiresValue(operator) && (filter.value === undefined || filter.value === null)) {
            return evaluateOperator(null, null, operator);
        }

        if (filter.field === "permissionSetId") {
            const permissionSetIds = context.permissionSetIds ?? [];
            if (operator === "is_blank" || operator === "is_not_blank") {
                return evaluateOperator(permissionSetIds.length ? 1 : null, null, operator);
            }
            const parsed = parseInt(filter.value ?? "", 10);
            if (Number.isNaN(parsed)) return false;
            const hasPermission = permissionSetIds.includes(parsed);
            return operator === "not_equals" ? !hasPermission : hasPermission;
        }

        const fieldDef = filter.fieldDefId
            ? fieldById.get(filter.fieldDefId)
            : filter.field
                ? fieldByApi.get(filter.field)
                : null;

        if (!fieldDef) return false;

        const leftValue = coerceFieldValue(fieldDef.type, context.recordValues[fieldDef.apiName]);
        if (leftValue === null && operatorRequiresValue(operator)) {
            return false;
        }
        if (operator === "is_blank" || operator === "is_not_blank") {
            return evaluateOperator(leftValue, null, operator);
        }
        const rightValue = coerceFieldValue(fieldDef.type, filter.value ?? "");
        return evaluateOperator(leftValue, rightValue, operator);
    });

    let matches = mode === "ANY" ? results.some(Boolean) : results.every(Boolean);

    if (mode === "CUSTOM" && visibility.expression) {
        const customResult = evaluateCustomLogicExpression(visibility.expression, results);
        if (customResult !== null) {
            matches = customResult;
        }
    }

    return !matches;
};

export const applyLayoutVisibility = (
    config: LayoutConfigV2,
    context: VisibilityContext
) => {
    const sections = config.sections
        .filter((section) => evaluateVisibility(section.visibility, context))
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => evaluateVisibility(item.visibility, context)),
        }));

    return {
        ...config,
        sections,
    };
};

export const getVisibilityExpressionValidation = (
    visibility: z.infer<typeof visibilityRuleSchema> | undefined
) => {
    const mode = resolveVisibilityMode(visibility);
    if (mode !== "CUSTOM") return { valid: true, message: "" };
    return validateCustomLogicExpressionInput(visibility?.expression, visibility?.filters?.length ?? 0);
};
