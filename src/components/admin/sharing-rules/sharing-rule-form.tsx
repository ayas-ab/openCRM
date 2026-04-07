"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createSharingRule, updateSharingRule } from "@/actions/admin/sharing-rule-actions";
import { validateCustomLogicExpressionInput } from "@/lib/validation/rule-logic";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";

type FieldOption = {
    id: number;
    label: string;
    apiName: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string; isActive: boolean }>;
};

type GroupOption = {
    id: number;
    name: string;
};

type ObjectOption = {
    id: number;
    label: string;
    apiName: string;
};

type FilterState = {
    id: string;
    fieldKey: string;
    operator: string;
    value: string;
};

type FieldOptionInternal = {
    key: string;
    label: string;
    fieldType: string;
    fieldApiName: string;
    system: boolean;
    fieldDefId?: number;
    picklistOptions?: Array<{ id: number; label: string; isActive?: boolean }>;
};

type CriteriaPayload = {
    logic?: "ALL" | "ANY" | "CUSTOM";
    expression?: string;
    filters?: Array<{
        fieldDefId?: number;
        field?: string;
        operator?: string;
        value?: string;
    }>;
};

type CriteriaFilter = NonNullable<CriteriaPayload["filters"]>[number];

type SharingRuleFormProps = {
    mode: "create" | "edit";
    objectDef: ObjectOption;
    fields: FieldOption[];
    groups: GroupOption[];
    initial?: {
        id?: number;
        name?: string;
        description?: string | null;
        targetGroupId?: number | null;
        accessLevel?: "READ" | "EDIT" | "DELETE";
        isActive?: boolean;
        criteria?: CriteriaPayload | null;
    };
    backHref: string;
};

const OPERATORS = [
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

const OWNER_GROUP_OPERATORS = new Set(["equals", "not_equals", "is_blank", "is_not_blank"]);

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

function toReadableExpression(expression?: string) {
    if (!expression) return "";
    return expression
        .replace(/\bAND\b/gi, " AND ")
        .replace(/\bOR\b/gi, " OR ")
        .replace(/\bNOT\b/gi, " NOT ")
        .replace(/\s+/g, " ")
        .trim();
}

function getValueInputType(fieldType?: string) {
    if (fieldType === "Date") return "date";
    if (fieldType === "DateTime") return "datetime-local";
    return "text";
}

function getValueInputValue(fieldType: string | undefined, value: string) {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value;
}

function getOperatorOptions(fieldType: string | undefined, isOwnerGroup: boolean) {
    if (isOwnerGroup) {
        return OPERATORS.filter((op) => OWNER_GROUP_OPERATORS.has(op.value));
    }
    if (!fieldType) return OPERATORS;
    if (fieldType === "Picklist") {
        return OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Lookup") {
        return OPERATORS.filter((op) => ["is_blank", "is_not_blank"].includes(op.value));
    }
    if (["Number"].includes(fieldType)) {
        return OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Date" || fieldType === "DateTime") {
        return OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    return OPERATORS.filter((op) => !["gt", "gte", "lt", "lte"].includes(op.value));
}

export function SharingRuleForm({
    mode,
    objectDef,
    fields,
    groups,
    initial,
    backHref,
}: SharingRuleFormProps) {
    const router = useRouter();

    const [name, setName] = useState(initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [targetGroupId, setTargetGroupId] = useState<number | null>(initial?.targetGroupId ?? null);
    const [accessLevel, setAccessLevel] = useState<"READ" | "EDIT" | "DELETE">(initial?.accessLevel ?? "READ");
    const [isActive, setIsActive] = useState(initial?.isActive ?? true);
    const [logic, setLogic] = useState<"ALL" | "ANY" | "CUSTOM">(
        initial?.criteria?.logic === "CUSTOM"
            ? "CUSTOM"
            : initial?.criteria?.logic === "ANY"
                ? "ANY"
                : "ALL"
    );
    const [expression, setExpression] = useState(toReadableExpression(initial?.criteria?.expression ?? ""));
    const [filters, setFilters] = useState<FilterState[]>(() => {
        const seeded = initial?.criteria?.filters ?? [];
        return seeded.map((filter) => {
            const fieldKey = filter.fieldDefId
                ? `field:${filter.fieldDefId}`
                : filter.field
                    ? `system:${filter.field}`
                    : "";
            return {
                id: generateId(),
                fieldKey,
                operator: filter.operator ?? "equals",
                value: filter.value ?? "",
            };
        });
    });

    const criteriaFields = useMemo(
        () => fields.filter((field) => !["TextArea", "File"].includes(field.type)),
        [fields]
    );

    const fieldOptions: FieldOptionInternal[] = useMemo(() => {
        const systemFields = [
            {
                key: "system:ownerGroupId",
                label: "Owner Group",
                fieldType: "OwnerGroup",
                fieldApiName: "ownerGroupId",
                system: true,
            },
        ];
        const objectFields = criteriaFields.map((field) => ({
            key: `field:${field.id}`,
            label: field.label,
            fieldType: field.type,
            fieldDefId: field.id,
            fieldApiName: field.apiName,
            picklistOptions: field.picklistOptions ?? [],
            system: false,
        }));
        return [...systemFields, ...objectFields];
    }, [criteriaFields]);

    const fieldOptionMap = useMemo(
        () => new Map(fieldOptions.map((option) => [option.key, option])),
        [fieldOptions]
    );

    const defaultFieldKey = useMemo(() => {
        const firstField = fieldOptions.find((option) => !option.system);
        return firstField?.key || fieldOptions[0]?.key || "";
    }, [fieldOptions]);

    const customLogicValidation = useMemo(() => {
        if (logic !== "CUSTOM") return { valid: true, message: "" };
        const result = validateCustomLogicExpressionInput(expression, filters.length);
        if (!result.valid) {
            if (result.message === "Expression references a condition number that does not exist.") {
                return { valid: false, message: `Use condition numbers between 1 and ${filters.length}.` };
            }
            return { valid: false, message: result.message };
        }
        return { valid: true, message: "" };
    }, [logic, expression, filters.length]);

    const addFilter = () => {
        setFilters((prev) => [
            ...prev,
            {
                id: generateId(),
                fieldKey: defaultFieldKey,
                operator: "equals",
                value: "",
            },
        ]);
    };

    const updateFilter = (id: string, updates: Partial<FilterState>) => {
        setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, ...updates } : filter)));
    };

    const removeFilter = (id: string) => {
        setFilters((prev) => prev.filter((filter) => filter.id !== id));
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error("Name is required.");
            return;
        }
        if (!targetGroupId) {
            toast.error("Select a target group.");
            return;
        }
        if (logic === "CUSTOM" && !customLogicValidation.valid) {
            toast.error(customLogicValidation.message || "Fix the custom logic expression.");
            return;
        }

        const criteriaFilters = filters
            .map((filter) => {
                const option = fieldOptionMap.get(filter.fieldKey);
                if (!option) return null;
                if (option.system) {
                    return {
                        field: option.fieldApiName ?? "ownerGroupId",
                        operator: filter.operator,
                        value: filter.value,
                    };
                }
                return {
                    fieldDefId: option.fieldDefId,
                    field: option.fieldApiName,
                    operator: filter.operator,
                    value: filter.value,
                };
            })
            .filter((filter) => filter !== null) as CriteriaFilter[];

        const payload = {
            objectDefId: objectDef.id,
            name: name.trim(),
            description: description.trim() || undefined,
            isActive,
            targetGroupId,
            accessLevel,
            criteria: {
                logic,
                expression: logic === "CUSTOM" ? expression : undefined,
                filters: criteriaFilters,
            },
        };

        const result =
            mode === "create"
                ? await createSharingRule(payload)
                : await updateSharingRule(initial?.id ?? 0, payload);

        if (!result.success) {
            toast.error(result.error || "Failed to save sharing rule.");
            return;
        }

        toast.success(mode === "create" ? "Sharing rule created." : "Sharing rule updated.");
        router.push(backHref);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle>{mode === "create" ? "New sharing rule" : "Edit sharing rule"}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Share records from <span className="font-medium text-foreground">{objectDef.label}</span> with a group when criteria match.
                        </p>
                    </div>
                    <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Active" : "Inactive"}</Badge>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Rule name</Label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Share high-value records" />
                    </div>
                    <div className="space-y-2">
                        <Label>Target group</Label>
                        <Select
                            value={targetGroupId ? String(targetGroupId) : undefined}
                            onValueChange={(value) => setTargetGroupId(Number(value))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select group..." />
                            </SelectTrigger>
                            <SelectContent>
                                {groups.map((group) => (
                                    <SelectItem key={group.id} value={String(group.id)}>
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Optional description"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Access level</Label>
                        <Select value={accessLevel} onValueChange={(value) => setAccessLevel(value as "READ" | "EDIT" | "DELETE")}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="READ">Read</SelectItem>
                                <SelectItem value="EDIT">Edit</SelectItem>
                                <SelectItem value="DELETE">Edit/Delete</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Rule status</p>
                            <p className="text-xs text-muted-foreground">Pause this rule without deleting it.</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle>Criteria</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Leave empty to share all records. Conditions are numbered for custom logic.
                        </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addFilter} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add condition
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {filters.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No conditions added. This rule will match every record.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filters.map((filter, index) => {
                                const option = fieldOptionMap.get(filter.fieldKey);
                                const fieldType = option?.fieldType;
                                const isOwnerGroup = option?.system && option?.key === "system:ownerGroupId";
                                const operators = getOperatorOptions(fieldType, Boolean(isOwnerGroup));
                                const needsValue = !["is_blank", "is_not_blank"].includes(filter.operator);

                                return (
                                    <div key={filter.id} className="rounded-xl border bg-card/70 p-4 shadow-sm">
                                        <div className="flex items-center justify-between">
                                            <Badge variant="outline">Condition {index + 1}</Badge>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeFilter(filter.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Field</Label>
                                                <Select
                                                    value={filter.fieldKey}
                                                    onValueChange={(value) =>
                                                        updateFilter(filter.id, { fieldKey: value, operator: "equals", value: "" })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select field" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {fieldOptions.map((fieldOption) => (
                                                            <SelectItem key={fieldOption.key} value={fieldOption.key}>
                                                                {fieldOption.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Operator</Label>
                                                <Select
                                                    value={filter.operator}
                                                    onValueChange={(value) => updateFilter(filter.id, { operator: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {operators.map((op) => (
                                                            <SelectItem key={op.value} value={op.value}>
                                                                {op.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {needsValue && isOwnerGroup && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Group</Label>
                                                    <Select
                                                        value={filter.value}
                                                        onValueChange={(value) => updateFilter(filter.id, { value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select group" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {groups.map((group) => (
                                                                <SelectItem key={group.id} value={String(group.id)}>
                                                                    {group.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            {needsValue && !isOwnerGroup && fieldType === "Picklist" && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Value</Label>
                                                    <Select
                                                        value={filter.value}
                                                        onValueChange={(value) => updateFilter(filter.id, { value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select option" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(option?.picklistOptions || [])
                                                                .filter((opt: { isActive?: boolean }) => opt.isActive !== false)
                                                                .map((opt: { id: number; label: string }) => (
                                                                    <SelectItem key={opt.id} value={String(opt.id)}>
                                                                        {opt.label}
                                                                    </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            {needsValue && !isOwnerGroup && fieldType !== "Picklist" && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Value</Label>
                                                    <Input
                                                        type={getValueInputType(fieldType)}
                                                        value={getValueInputValue(fieldType, filter.value)}
                                                        onChange={(event) =>
                                                            updateFilter(filter.id, { value: event.target.value })
                                                        }
                                                        placeholder="Enter value"
                                                    />
                                                </div>
                                            )}
                                            {!needsValue && (
                                                <div className="text-xs text-muted-foreground flex items-center">
                                                    No value required
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <Separator />

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Info className="h-4 w-4 text-muted-foreground" />
                            Match logic
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant={logic === "ALL" ? "default" : "outline"}
                                onClick={() => setLogic("ALL")}
                            >
                                All conditions (AND)
                            </Button>
                            <Button
                                type="button"
                                variant={logic === "ANY" ? "default" : "outline"}
                                onClick={() => setLogic("ANY")}
                            >
                                Any condition (OR)
                            </Button>
                            <Button
                                type="button"
                                variant={logic === "CUSTOM" ? "default" : "outline"}
                                onClick={() => setLogic("CUSTOM")}
                            >
                                Custom expression
                            </Button>
                        </div>
                        {logic === "CUSTOM" && (
                            <div className="space-y-2">
                                <Label>Custom logic</Label>
                                <Textarea
                                    value={expression}
                                    onChange={(event) => setExpression(event.target.value)}
                                    placeholder="(1 AND 2) OR 3"
                                />
                                {!customLogicValidation.valid && (
                                    <p className="text-xs text-destructive">{customLogicValidation.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Use condition numbers with AND/OR/NOT. Parentheses are supported.
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                    Sharing rules apply only to user-owned records. Queue-owned records are not shared.
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push(backHref)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit}>
                        {mode === "create" ? "Create rule" : "Save changes"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
