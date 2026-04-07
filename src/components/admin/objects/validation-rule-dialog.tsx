"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";
import { Info, Plus, Trash2 } from "lucide-react";

type FieldOption = {
    id: number;
    label: string;
    apiName: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string; isActive?: boolean }>;
};

export type ConditionFormValue = {
    id: string;
    fieldDefId: number | null;
    operator: string;
    compareSource: "value" | "field";
    compareValue?: string;
    compareFieldId?: number | null;
};

export type ValidationRuleFormValues = {
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

interface ValidationRuleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fields: FieldOption[];
    initialValues?: ValidationRuleFormValues;
    onSubmit: (values: ValidationRuleFormValues) => void;
    isSubmitting?: boolean;
}

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

const COMPARE_SOURCE_OPTIONS = [
    {
        value: "value",
        label: "Static Value",
        description: "Compare the field against a fixed value (e.g. Stage equals \"Prospecting\").",
    },
    {
        value: "field",
        label: "Another Field",
        description: "Compare two fields on the same record (e.g. Close Date >= Created Date).",
    },
];

function operatorRequiresValue(operator: string) {
    return !["is_blank", "is_not_blank"].includes(operator);
}

function getOperatorOptions(fieldType: string | undefined, compareSource: string) {
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
    if (fieldType && ["Number", "Currency"].includes(fieldType)) {
        return BASE_OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Date" || fieldType === "DateTime") {
        return BASE_OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Checkbox") {
        return BASE_OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    // Default (text, picklist, email, phone, etc.): no numeric comparisons
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
        fieldDefId: firstField ? firstField.id : null,
        operator: "equals",
        compareSource: "value",
        compareValue: "",
        compareFieldId: null,
    };
}

export function ValidationRuleDialog({
    open,
    onOpenChange,
    fields,
    initialValues,
    onSubmit,
    isSubmitting,
}: ValidationRuleDialogProps) {
    const criteriaFields = useMemo(
        () => fields.filter((field) => !["File"].includes(field.type)),
        [fields]
    );
    const defaultValues: ValidationRuleFormValues = initialValues ?? {
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

    const [formState, setFormState] = useState<ValidationRuleFormValues>(defaultValues);

    useEffect(() => {
        setFormState(initialValues ?? {
            name: "",
            description: "",
            logicOperator: "ALL",
            errorPlacement: "toast",
            errorFieldId: null,
            errorMessage: "",
            isActive: true,
            conditions: [createEmptyCondition(criteriaFields)],
        });
    }, [initialValues, criteriaFields]);

    const fieldMap = useMemo(
        () => new Map(criteriaFields.map((field) => [field.id, field])),
        [criteriaFields]
    );

    const updateField = (key: keyof ValidationRuleFormValues, value: any) => {
        setFormState((prev) => ({ ...prev, [key]: value }));
    };

    const updateCondition = (id: string, key: keyof ConditionFormValue, value: any) => {
        setFormState((prev) => ({
            ...prev,
            conditions: prev.conditions.map((condition) =>
                condition.id === id
                    ? {
                        ...condition,
                        [key]: value,
                    }
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

    const isSaveDisabled =
        !formState.name ||
        !formState.errorMessage ||
        formState.conditions.length === 0 ||
        formState.conditions.some((condition) => {
            if (!condition.fieldDefId) return true;
            if (condition.compareSource === "value") {
                return operatorRequiresValue(condition.operator) && !condition.compareValue?.trim();
            }
            if (condition.compareSource === "field") {
                return !condition.compareFieldId;
            }
            return false;
        }) ||
        (formState.logicOperator === "CUSTOM" && !(formState.logicExpression || "").trim()) ||
        (formState.errorPlacement === "inline" && !formState.errorFieldId);

    const handleSubmit = () => {
        onSubmit(formState);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{initialValues ? "Edit Validation Rule" : "New Validation Rule"}</DialogTitle>
                </DialogHeader>
                <TooltipProvider>
                    <div className="grid gap-6 py-4">
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

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Match Logic</Label>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-sm text-sm">
                                        Choose how multiple conditions are evaluated. All = every condition must be true; Any = any single condition triggers the error.
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
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                        Conditions
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        Define scenarios that should block a save. If the conditions evaluate to true, the supplied error message is shown.
                                    </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addCondition} className="gap-1">
                                    <Plus className="h-4 w-4" />
                                    Add Condition
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {formState.conditions.map((condition, index) => {
                                    const field = condition.fieldDefId ? fieldMap.get(condition.fieldDefId) : undefined;
                                    const operatorOptions = getOperatorOptions(field?.type, condition.compareSource);
                                    const showFieldSelect = true;
                                    const showOperator = true;
                                    const showValueInput = condition.compareSource === "value";
                                    const showCompareField = condition.compareSource === "field";
                                    const isCharacterLengthOperator = CHARACTER_LENGTH_OPERATOR_VALUES.has(condition.operator);
                                    const isBlankOperator = ["is_blank", "is_not_blank"].includes(condition.operator);

                                    return (
                                        <div key={condition.id} className="rounded-2xl border bg-card/60 p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                                    Condition {index + 1}
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
                                            <div className="mt-4 grid gap-4 md:grid-cols-2">
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

                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Label>Compare Against</Label>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Info className="h-4 w-4 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-sm text-sm">
                                                                Choose whether to compare the field to a static value or another field on the record.
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
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
                                                            {COMPARE_SOURCE_OPTIONS.map((option) => (
                                                                <SelectItem key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <p className="text-xs text-muted-foreground">
                                                        {COMPARE_SOURCE_OPTIONS.find((opt) => opt.value === condition.compareSource)?.description}
                                                    </p>
                                                </div>

                                                {showOperator && (
                                                    <div className="space-y-2">
                                                        <Label>Operator</Label>
                                                        <Select
                                                            value={condition.operator}
                                                            onValueChange={(value) => {
                                                                const isBlankOp = ["is_blank", "is_not_blank"].includes(value);
                                                                const isCharLengthOp = CHARACTER_LENGTH_OPERATOR_VALUES.has(value);
                                                                updateCondition(condition.id, "operator", value);
                                                                if (isBlankOp) {
                                                                    updateCondition(condition.id, "compareSource", "value");
                                                                    updateCondition(condition.id, "compareValue", "true");
                                                                    updateCondition(condition.id, "compareFieldId", null);
                                                                }
                                                                if (isCharLengthOp) {
                                                                    updateCondition(condition.id, "compareSource", "value");
                                                                    updateCondition(condition.id, "compareFieldId", null);
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

                                                {showValueInput && (
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
                                                )}

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
                                                                {criteriaFields.map((option) => (
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
                    </div>
                </div>

                        <div className="grid gap-3">
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
                                {formState.errorPlacement === "inline" && (
                                    <div className="space-y-2">
                                        <Label>Show under field</Label>
                                        <Select
                                            value={formState.errorFieldId ? String(formState.errorFieldId) : undefined}
                                            onValueChange={(value) => updateField("errorFieldId", Number(value))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select field..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {fields.map((option) => (
                                                    <SelectItem key={option.id} value={String(option.id)}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Optional; defaults to toast if no field selected.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
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
                    </div>
                </TooltipProvider>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSaveDisabled || isSubmitting}>
                        {isSubmitting ? "Saving..." : "Save Rule"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
