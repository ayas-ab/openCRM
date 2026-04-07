"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createValidationRule, updateValidationRule, deleteValidationRule } from "@/actions/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { validateCustomLogicExpressionInput } from "@/lib/validation/rule-logic";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";
import { Info, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type FieldOption = {
    id: number;
    label: string;
    apiName: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string; isActive?: boolean }>;
};

type PermissionSetOption = {
    id: number;
    name: string;
};

export type ConditionFormValue = {
    id: string;
    conditionType: "field" | "currentUserPermission";
    fieldDefId: number | null;
    operator: string;
    compareSource: "value" | "field";
    compareValue?: string;
    compareFieldId?: number | null;
    permissionSetId?: number | null;
};

export type ValidationRuleFormValues = {
    id?: number;
    name: string;
    description?: string;
    logicOperator: "ALL" | "ANY" | "CUSTOM";
    logicExpression?: string;
    errorPlacement: "toast" | "inline";
    errorFieldId?: number | null;
    errorMessage: string;
    isActive: boolean;
    conditions: ConditionFormValue[];
};

const BASE_OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "gt", label: "Greater Than" },
    { value: "gte", label: "Greater Or Equal" },
    { value: "lt", label: "Less Than" },
    { value: "lte", label: "Less Or Equal" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does Not Contain" },
    { value: "is_blank", label: "Is Blank" },
    { value: "is_not_blank", label: "Is Not Blank" },
];

const CHARACTER_LENGTH_OPERATORS = [
    { value: "character_length_lt", label: "Character length <" },
    { value: "character_length_lte", label: "Character length <=" },
    { value: "character_length_eq", label: "Character length =" },
    { value: "character_length_gte", label: "Character length >=" },
    { value: "character_length_gt", label: "Character length >" },
];

const CHARACTER_LENGTH_OPERATOR_VALUES = new Set(
    CHARACTER_LENGTH_OPERATORS.map((operator) => operator.value)
);
const TEXTAREA_ALLOWED_OPERATORS = new Set([
    "is_blank",
    "is_not_blank",
    ...CHARACTER_LENGTH_OPERATORS.map((operator) => operator.value),
]);

const SYSTEM_PERMISSION_OPERATORS = [
    { value: "has_permission", label: "Has permission" },
    { value: "not_has_permission", label: "Does not have permission" },
];

const COMPARE_SOURCE_OPTIONS = [
    {
        value: "value",
        label: "Static Value",
        description: 'Compare the field against a fixed value (e.g. Stage equals "Prospecting").',
    },
    {
        value: "field",
        label: "Another Field",
        description: "Compare two fields on the same record (e.g. Close Date >= Created Date).",
    },
];

const TEXT_LIKE_FIELD_TYPES = new Set(["Text", "Email", "Phone", "Url", "AutoNumber"]);

function operatorRequiresValue(operator: string) {
    return !["is_blank", "is_not_blank"].includes(operator);
}

function getCompareSourceOptions(fieldType: string | undefined, operator: string) {
    if (!fieldType) return COMPARE_SOURCE_OPTIONS;
    if (["is_blank", "is_not_blank"].includes(operator)) {
        return [];
    }
    if (CHARACTER_LENGTH_OPERATOR_VALUES.has(operator)) {
        return COMPARE_SOURCE_OPTIONS.filter((option) => option.value === "value");
    }
    if (fieldType === "Picklist" || fieldType === "Lookup" || fieldType === "TextArea" || fieldType === "Checkbox") {
        return COMPARE_SOURCE_OPTIONS.filter((option) => option.value === "value");
    }
    return COMPARE_SOURCE_OPTIONS;
}

function getCompatibleCompareFields(fields: FieldOption[], field: FieldOption | undefined) {
    if (!field) return [];
    if (field.type === "Number" || field.type === "Currency") {
        return fields.filter((option) => option.type === "Number" || option.type === "Currency");
    }
    if (field.type === "Date" || field.type === "DateTime") {
        return fields.filter((option) => option.type === field.type);
    }
    if (field.type === "Checkbox") {
        return fields.filter((option) => option.type === "Checkbox");
    }
    if (TEXT_LIKE_FIELD_TYPES.has(field.type)) {
        return fields.filter((option) => TEXT_LIKE_FIELD_TYPES.has(option.type));
    }
    return [];
}

function getOperatorOptions(
    fieldType: string | undefined,
    compareSource: string,
    conditionType: ConditionFormValue["conditionType"]
) {
    if (conditionType === "currentUserPermission") {
        return SYSTEM_PERMISSION_OPERATORS;
    }
    if (!fieldType) return BASE_OPERATORS;
    if (fieldType === "Picklist") {
        return BASE_OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Lookup") {
        return BASE_OPERATORS.filter((op) => ["is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "TextArea") {
        const blankOperators = BASE_OPERATORS.filter((op) => ["is_blank", "is_not_blank"].includes(op.value));
        if (compareSource !== "value") {
            return blankOperators;
        }
        return [...CHARACTER_LENGTH_OPERATORS, ...blankOperators];
    }
    if (["Number", "Currency"].includes(fieldType)) {
        return BASE_OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Date" || fieldType === "DateTime") {
        return BASE_OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Checkbox") {
        return BASE_OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    const textOperators = BASE_OPERATORS.filter((op) => !["gt", "gte", "lt", "lte"].includes(op.value));
    if (compareSource === "value") {
        return [...CHARACTER_LENGTH_OPERATORS, ...textOperators];
    }
    return textOperators;
}

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

function normalizeLogicExpressionForDisplay(expression: string | undefined) {
    if (!expression) return "";
    return expression
        .replace(/\s*&&\s*/g, " AND ")
        .replace(/\s*\|\|\s*/g, " OR ")
        .replace(/!\s*/g, "NOT ")
        .replace(/\s+/g, " ")
        .trim();
}

function getValueInputType(fieldType?: string) {
    if (fieldType === "Date") return "date";
    if (fieldType === "DateTime") return "datetime-local";
    return "text";
}

function getValueInputValue(fieldType: string | undefined, value: string | undefined) {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value || "";
}

function createEmptyCondition(fields: FieldOption[]): ConditionFormValue {
    const firstField = fields[0];
    return {
        id: generateId(),
        conditionType: "field",
        fieldDefId: firstField ? firstField.id : null,
        operator: "equals",
        compareSource: "value",
        compareValue: "true",
        compareFieldId: null,
        permissionSetId: null,
    };
}

interface ValidationRuleFormProps {
    objectId: number;
    fields: FieldOption[];
    permissionSets: PermissionSetOption[];
    initialValues?: ValidationRuleFormValues;
}

export function ValidationRuleForm({ objectId, fields, permissionSets, initialValues }: ValidationRuleFormProps) {
    const router = useRouter();
    const criteriaFields = useMemo(
        () => fields.filter((field) => !["File"].includes(field.type)),
        [fields]
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formState, setFormState] = useState<ValidationRuleFormValues>(() => {
        if (initialValues) {
            return {
                ...initialValues,
                logicExpression: normalizeLogicExpressionForDisplay(initialValues.logicExpression),
            };
        }
        return {
            name: "",
            description: "",
            logicOperator: "ALL",
            logicExpression: "",
            errorPlacement: "toast",
            errorFieldId: null,
            errorMessage: "",
            isActive: true,
            conditions: [createEmptyCondition(criteriaFields)],
        };
    });

    useEffect(() => {
        if (initialValues) {
            setFormState({
                ...initialValues,
                logicExpression: normalizeLogicExpressionForDisplay(initialValues.logicExpression),
            });
        }
    }, [initialValues]);

    const fieldMap = useMemo(() => new Map(criteriaFields.map((f) => [f.id, f])), [criteriaFields]);

    const updateField = (key: keyof ValidationRuleFormValues, value: any) => {
        setFormState((prev) => ({ ...prev, [key]: value }));
    };

    const updateCondition = (id: string, key: keyof ConditionFormValue, value: any) => {
        setFormState((prev) => ({
            ...prev,
            conditions: prev.conditions.map((condition) =>
                condition.id === id
                    ? (() => {
                        const next = {
                            ...condition,
                            [key]: value,
                        };

                        if (key === "conditionType") {
                            if (value === "currentUserPermission") {
                                next.fieldDefId = null;
                                next.operator = "has_permission";
                                next.compareSource = "value";
                                next.compareValue = "";
                                next.compareFieldId = null;
                            } else {
                                next.operator = "equals";
                            }
                        }

                        if (key === "fieldDefId" && value) {
                            const selectedField = fieldMap.get(Number(value));
                            if (selectedField?.type === "Picklist" || selectedField?.type === "Lookup" || selectedField?.type === "TextArea" || selectedField?.type === "Checkbox") {
                                next.compareSource = "value";
                                next.compareFieldId = null;
                            }
                            if (selectedField?.type === "Picklist") {
                                next.operator = ["equals", "not_equals", "is_blank", "is_not_blank"].includes(next.operator) ? next.operator : "equals";
                            }
                            if (selectedField?.type === "Lookup") {
                                next.operator = ["is_blank", "is_not_blank"].includes(next.operator) ? next.operator : "is_blank";
                                next.compareSource = "value";
                            }
                            if (selectedField?.type === "TextArea") {
                                next.compareSource = "value";
                                if (!TEXTAREA_ALLOWED_OPERATORS.has(next.operator)) {
                                    next.operator = "character_length_eq";
                                    next.compareValue = "";
                                }
                            }
                        }

                        if (key === "compareSource") {
                            if (value === "value") {
                                next.compareFieldId = null;
                            }
                            if (value === "field") {
                                next.compareValue = "";
                            }
                        }

                        if (key === "operator") {
                            if (["is_blank", "is_not_blank"].includes(String(value))) {
                                next.compareSource = "value";
                                next.compareValue = "";
                                next.compareFieldId = null;
                            }
                            if (CHARACTER_LENGTH_OPERATOR_VALUES.has(String(value))) {
                                next.compareSource = "value";
                                next.compareFieldId = null;
                            }
                        }

                        return next;
                    })()
                    : condition
            ),
        }));
    };

    const addCondition = () => {
        setFormState((prev) => ({
            ...prev,
            conditions: [...prev.conditions, createEmptyCondition(criteriaFields)],
        }));
    };

    const removeCondition = (id: string) => {
        setFormState((prev) => ({
            ...prev,
            conditions: prev.conditions.filter((condition) => condition.id !== id),
        }));
    };

    const customLogicValidation = useMemo(() => {
        if (formState.logicOperator !== "CUSTOM") return { valid: true, message: "" };
        const result = validateCustomLogicExpressionInput(
            formState.logicExpression,
            formState.conditions.length,
            "(1 OR 2) AND 3"
        );
        if (!result.valid) {
            if (result.message === "Expression references a condition number that does not exist.") {
                return { valid: false, message: `Use condition numbers between 1 and ${formState.conditions.length}.` };
            }
            return { valid: false, message: result.message };
        }
        return { valid: true, message: "" };
    }, [formState.logicOperator, formState.logicExpression, formState.conditions.length]);

    const isSaveDisabled =
        !formState.name ||
        !formState.errorMessage ||
        formState.conditions.length === 0 ||
        formState.conditions.some((condition) => {
            if (condition.conditionType === "currentUserPermission") {
                return !condition.permissionSetId;
            }
            if (!condition.fieldDefId) return true;
            if (condition.compareSource === "value") {
                return operatorRequiresValue(condition.operator) && !condition.compareValue?.trim();
            }
            if (condition.compareSource === "field") {
                return !condition.compareFieldId;
            }
            return false;
        }) ||
        (formState.logicOperator === "CUSTOM" && !customLogicValidation.valid) ||
        (formState.errorPlacement === "inline" && !formState.errorFieldId);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const payload = {
            objectDefId: objectId,
            name: formState.name,
            description: formState.description,
            logicOperator: formState.logicOperator,
            logicExpression: formState.logicExpression,
            errorPlacement: formState.errorPlacement,
            errorFieldId: formState.errorFieldId ?? undefined,
            errorMessage: formState.errorMessage,
            isActive: formState.isActive,
            conditions: formState.conditions.map((condition) => ({
                fieldDefId: condition.conditionType === "field" ? condition.fieldDefId ?? undefined : undefined,
                systemField: condition.conditionType === "currentUserPermission" ? "currentUserPermissionSetId" : undefined,
                permissionSetId: condition.conditionType === "currentUserPermission" ? condition.permissionSetId ?? undefined : undefined,
                operator: condition.operator,
                compareSource: condition.compareSource,
                compareValue: condition.compareValue,
                compareFieldId: condition.compareFieldId ?? undefined,
            })),
        } as Parameters<typeof createValidationRule>[0];

        const result = formState.id
            ? await updateValidationRule(formState.id, payload)
            : await createValidationRule(payload);

        if (result.success) {
            toast.success(formState.id ? "Validation rule updated." : "Validation rule created.");
            router.push(`/admin/objects/${objectId}`);
        } else {
            toast.error(result.error || "Failed to save validation rule.");
        }
        setIsSubmitting(false);
    };

    const handleDelete = async () => {
        if (!formState.id) return;
        setIsSubmitting(true);
        const result = await deleteValidationRule(formState.id, objectId);
        if (result.success) {
            toast.success("Validation rule deleted.");
            router.push(`/admin/objects/${objectId}`);
        } else {
            toast.error(result.error || "Failed to delete validation rule.");
        }
        setIsSubmitting(false);
    };

    return (
        <TooltipProvider>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" asChild>
                            <Link href={`/admin/objects/${objectId}`}>
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Validation Rules</p>
                            <h1 className="text-2xl font-semibold">
                                {formState.id ? "Edit Validation Rule" : "New Validation Rule"}
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {formState.id && (
                            <Button variant="ghost" className="text-destructive" onClick={handleDelete} disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                            </Button>
                        )}
                        <Button onClick={handleSubmit} disabled={isSaveDisabled || isSubmitting}>
                            {isSubmitting ? "Saving..." : "Save Rule"}
                        </Button>
                    </div>
                </div>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle>Rule Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label>Name</Label>
                            <Input
                                value={formState.name}
                                onChange={(event) => updateField("name", event.target.value)}
                                placeholder="Opportunity must have Amount"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea
                                value={formState.description || ""}
                                onChange={(event) => updateField("description", event.target.value)}
                                placeholder="Explain why this validation exists."
                            />
                        </div>
                        <div className="grid gap-3">
                            <div className="flex items-center gap-2">
                                <Label>Match Logic</Label>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-sm text-sm">
                                        Choose how multiple conditions are evaluated. Reference conditions by number for custom expressions.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={formState.logicOperator === "ALL" ? "default" : "outline"}
                                    onClick={() => updateField("logicOperator", "ALL")}
                                >
                                    All conditions (AND)
                                </Button>
                                <Button
                                    type="button"
                                    variant={formState.logicOperator === "ANY" ? "default" : "outline"}
                                    onClick={() => updateField("logicOperator", "ANY")}
                                >
                                    Any condition (OR)
                                </Button>
                                <Button
                                    type="button"
                                    variant={formState.logicOperator === "CUSTOM" ? "default" : "outline"}
                                    onClick={() => updateField("logicOperator", "CUSTOM")}
                                >
                                    Custom expression
                                </Button>
                            </div>
                            {formState.logicOperator === "CUSTOM" && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        Custom Logic
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-4 w-4 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-sm text-sm leading-relaxed">
                                                Reference conditions by number (e.g. <code>(1 OR 2) AND 3</code>). Use <code>AND</code>, <code>OR</code>, <code>NOT</code>, and parentheses to group.
                                            </TooltipContent>
                                        </Tooltip>
                                    </Label>
                                    <Textarea
                                        value={formState.logicExpression || ""}
                                        onChange={(event) => updateField("logicExpression", event.target.value)}
                                        placeholder="(1 OR 2) AND 3"
                                        className={cn("font-mono text-sm", !customLogicValidation.valid && "border-destructive")}
                                    />
                                    {!customLogicValidation.valid && (
                                        <p className="text-xs text-destructive">{customLogicValidation.message}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Conditions are numbered in the order listed below.
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Conditions</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={addCondition} className="gap-1">
                                Add Condition
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {formState.conditions.map((condition, index) => {
                            const field = condition.fieldDefId ? fieldMap.get(condition.fieldDefId) : undefined;
                            const operatorOptions = getOperatorOptions(field?.type, condition.compareSource, condition.conditionType);
                            const compareSourceOptions = condition.conditionType === "field"
                                ? getCompareSourceOptions(field?.type, condition.operator)
                                : [];
                            const compatibleCompareFields = getCompatibleCompareFields(criteriaFields, field);
                            const showFieldSelect = condition.conditionType === "field";
                            const showOperator = condition.conditionType === "field" || condition.conditionType === "currentUserPermission";
                            const showValueInput =
                                condition.conditionType === "field" &&
                                condition.compareSource === "value" &&
                                !["is_blank", "is_not_blank"].includes(condition.operator);
                            const showCompareField = condition.conditionType === "field" && condition.compareSource === "field";
                            const showPermissionSelect = condition.conditionType === "currentUserPermission";
                            const isCharacterLengthOperator = CHARACTER_LENGTH_OPERATOR_VALUES.has(condition.operator);
                            const isBlankOperator = ["is_blank", "is_not_blank"].includes(condition.operator);
                            const conditionLabel =
                                condition.conditionType === "currentUserPermission"
                                    ? "Current user"
                                    : field?.label ?? "Select field";
                            const compareSourceLabel = compareSourceOptions.length === 1 ? compareSourceOptions[0]?.label : null;

                            return (
                                <div
                                    key={condition.id}
                                    className={cn(
                                        "rounded-2xl border bg-card/60 p-4 shadow-sm",
                                        condition.conditionType === "currentUserPermission" && "border-amber-200 bg-amber-50/40"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">Condition {index + 1}</Badge>
                                            <Badge variant="secondary">{conditionLabel}</Badge>
                                        </div>
                                        {formState.conditions.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeCondition(condition.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="mt-4 grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
                                        <div className="space-y-2">
                                            <Label>Condition Type</Label>
                                            <Select
                                                value={condition.conditionType}
                                                onValueChange={(value: ConditionFormValue["conditionType"]) =>
                                                    updateCondition(condition.id, "conditionType", value)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="field">Record field</SelectItem>
                                                    <SelectItem value="currentUserPermission">Current user permission</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {showFieldSelect && (
                                            <div className="space-y-2">
                                                <Label>Field</Label>
                                                <Select
                                                    value={condition.fieldDefId ? String(condition.fieldDefId) : undefined}
                                                    onValueChange={(value) =>
                                                        updateCondition(condition.id, "fieldDefId", Number(value))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select field..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {criteriaFields.map((option) => (
                                                            <SelectItem key={option.id} value={String(option.id)}>
                                                                {option.label} ({option.type})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {showOperator && (
                                            <div className="space-y-2">
                                                <Label>Operator</Label>
                                                <Select
                                                    value={condition.operator}
                                                    onValueChange={(value) => {
                                                        const isBlankOp = ["is_blank", "is_not_blank"].includes(value);
                                                        const isCharLengthOp = CHARACTER_LENGTH_OPERATOR_VALUES.has(value);
                                                        updateCondition(condition.id, "operator", value);
                                                        if ((isBlankOp || isCharLengthOp) && condition.conditionType === "field") {
                                                            updateCondition(condition.id, "compareSource", "value");
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {operatorOptions.map((operator) => (
                                                            <SelectItem key={operator.value} value={operator.value}>
                                                                {operator.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {condition.conditionType === "field" && compareSourceOptions.length > 1 && (
                                            <div className="space-y-2">
                                                <Label>Compare To</Label>
                                                <Select
                                                    value={condition.compareSource}
                                                    onValueChange={(value: "value" | "field") =>
                                                        updateCondition(condition.id, "compareSource", value)
                                                    }
                                                    disabled={isBlankOperator || isCharacterLengthOperator}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {compareSourceOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {condition.conditionType === "field" && compareSourceOptions.length === 1 && compareSourceLabel && (
                                            <div className="space-y-2">
                                                <Label>Compare To</Label>
                                                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                                                    {compareSourceLabel}
                                                </div>
                                            </div>
                                        )}

                                        {showPermissionSelect && (
                                            <div className="space-y-2">
                                                <Label>Permission Set</Label>
                                                <Select
                                                    value={condition.permissionSetId ? String(condition.permissionSetId) : undefined}
                                                    onValueChange={(value) =>
                                                        updateCondition(condition.id, "permissionSetId", Number(value))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select permission set..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {permissionSets.map((set) => (
                                                            <SelectItem key={set.id} value={String(set.id)}>
                                                                {set.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {condition.conditionType === "field" && isBlankOperator && (
                                            <div className="space-y-2">
                                                <Label>Comparison</Label>
                                                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                                                    No additional value is needed for blank checks.
                                                </div>
                                            </div>
                                        )}

                                        {showValueInput ? (
                                            <div className="space-y-2">
                                                <Label>Value</Label>
                                                {field?.type === "Picklist" ? (
                                                    <Select
                                                        value={condition.compareValue || ""}
                                                        onValueChange={(value) =>
                                                            updateCondition(condition.id, "compareValue", value)
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select option..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(field.picklistOptions || [])
                                                                .filter((opt: any) => opt.isActive !== false)
                                                                .map((opt: any) => (
                                                                    <SelectItem key={opt.id} value={String(opt.id)}>
                                                                        {opt.label}
                                                                    </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : isCharacterLengthOperator ? (
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={condition.compareValue || ""}
                                                        onChange={(event) =>
                                                            updateCondition(condition.id, "compareValue", event.target.value)
                                                        }
                                                        placeholder="Enter character length..."
                                                    />
                                                ) : (
                                                    <Input
                                                        type={getValueInputType(field?.type)}
                                                        value={getValueInputValue(field?.type, condition.compareValue)}
                                                        onChange={(event) =>
                                                            updateCondition(condition.id, "compareValue", event.target.value)
                                                        }
                                                        placeholder="Enter compare value..."
                                                    />
                                                )}
                                            </div>
                                        ) : null}

                                        {showCompareField && (
                                            <div className="space-y-2">
                                                <Label>Compare Field</Label>
                                                <Select
                                                    value={condition.compareFieldId ? String(condition.compareFieldId) : undefined}
                                                    onValueChange={(value) =>
                                                        updateCondition(condition.id, "compareFieldId", Number(value))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select field..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {compatibleCompareFields.map((option) => (
                                                            <SelectItem key={option.id} value={String(option.id)}>
                                                                {option.label} ({option.type})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle>Error Handling</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-2">
                            <Label>Error Message</Label>
                            <Input
                                value={formState.errorMessage}
                                onChange={(event) => updateField("errorMessage", event.target.value)}
                                placeholder="Displayed when validation fails"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Display Location</Label>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={formState.errorPlacement === "toast" ? "default" : "outline"}
                                    onClick={() => updateField("errorPlacement", "toast")}
                                >
                                    Toast notification
                                </Button>
                                <Button
                                    type="button"
                                    variant={formState.errorPlacement === "inline" ? "default" : "outline"}
                                    onClick={() => updateField("errorPlacement", "inline")}
                                >
                                    Inline under fields
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Choose where the validation message should appear when the rule triggers.
                            </p>
                        </div>

                        {formState.errorPlacement === "inline" && (
                            <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Label>Target Field</Label>
                                <Select
                                    value={formState.errorFieldId ? String(formState.errorFieldId) : undefined}
                                    onValueChange={(value) => updateField("errorFieldId", Number(value))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select field to display error..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.map((option) => (
                                            <SelectItem key={option.id} value={String(option.id)}>
                                                {option.label} ({option.apiName})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The error message will appear in red text below this field.
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                            <div>
                                <p className="text-sm font-medium">Rule Status</p>
                                <p className="text-xs text-muted-foreground">
                                    Toggle to disable this rule without deleting it.
                                </p>
                            </div>
                            <Switch
                                checked={formState.isActive}
                                onCheckedChange={(checked) => updateField("isActive", checked)}
                            />
                        </div>
                    </CardContent>
                </Card >
            </div >
        </TooltipProvider >
    );
}
