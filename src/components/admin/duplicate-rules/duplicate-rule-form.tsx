"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createDuplicateRule, updateDuplicateRule } from "@/actions/admin/duplicate-rule-actions";
import { validateCustomLogicExpressionInput } from "@/lib/validation/rule-logic";

type FieldOption = {
    id: number;
    label: string;
    apiName: string;
    type: string;
};

type ObjectOption = {
    id: number;
    label: string;
    apiName: string;
};

type DuplicateRuleFormProps = {
    mode: "create" | "edit";
    objectDef: ObjectOption;
    fields: FieldOption[];
    initial?: {
        id?: number;
        name?: string;
        description?: string | null;
        isActive?: boolean;
        createAction?: "NONE" | "WARN" | "BLOCK";
        editAction?: "NONE" | "WARN" | "BLOCK";
        logicOperator?: "ALL" | "ANY" | "CUSTOM";
        logicExpression?: string | null;
        fieldDefIds?: number[];
    };
    backHref: string;
};

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

type ConditionState = {
    id: string;
    fieldDefId: number | null;
};

function toReadableExpression(expression?: string | null) {
    if (!expression) return "";
    return expression
        .replace(/\bAND\b/gi, " AND ")
        .replace(/\bOR\b/gi, " OR ")
        .replace(/\bNOT\b/gi, " NOT ")
        .replace(/\s+/g, " ")
        .trim();
}

export function DuplicateRuleForm({
    mode,
    objectDef,
    fields,
    initial,
    backHref,
}: DuplicateRuleFormProps) {
    const router = useRouter();
    const [name, setName] = useState(initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [isActive, setIsActive] = useState(initial?.isActive ?? true);
    const [createAction, setCreateAction] = useState<"NONE" | "WARN" | "BLOCK">(initial?.createAction ?? "WARN");
    const [editAction, setEditAction] = useState<"NONE" | "WARN" | "BLOCK">(initial?.editAction ?? "WARN");
    const [logicOperator, setLogicOperator] = useState<"ALL" | "ANY" | "CUSTOM">(initial?.logicOperator ?? "ALL");
    const [logicExpression, setLogicExpression] = useState(toReadableExpression(initial?.logicExpression));
    const [conditions, setConditions] = useState<ConditionState[]>(() => {
        const seeded = initial?.fieldDefIds ?? [];
        if (seeded.length > 0) {
            return seeded.map((fieldDefId) => ({
                id: generateId(),
                fieldDefId,
            }));
        }
        return fields.slice(0, 2).map((field) => ({
            id: generateId(),
            fieldDefId: field.id,
        }));
    });

    const fieldMap = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);

    const customLogicValidation = useMemo(() => {
        if (logicOperator !== "CUSTOM") return { valid: true, message: "" };
        const result = validateCustomLogicExpressionInput(logicExpression, conditions.length);
        if (!result.valid) {
            if (result.message === "Expression references a condition number that does not exist.") {
                return { valid: false, message: `Use condition numbers between 1 and ${conditions.length}.` };
            }
            return { valid: false, message: result.message };
        }
        return { valid: true, message: "" };
    }, [logicOperator, logicExpression, conditions.length]);

    const addCondition = () => {
        const nextField = fields.find((field) => !conditions.some((condition) => condition.fieldDefId === field.id)) ?? fields[0];
        setConditions((prev) => [...prev, { id: generateId(), fieldDefId: nextField?.id ?? null }]);
    };

    const updateCondition = (id: string, fieldDefId: number) => {
        setConditions((prev) => prev.map((condition) => (condition.id === id ? { ...condition, fieldDefId } : condition)));
    };

    const removeCondition = (id: string) => {
        setConditions((prev) => prev.filter((condition) => condition.id !== id));
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error("Name is required.");
            return;
        }

        const fieldDefIds = conditions
            .map((condition) => condition.fieldDefId)
            .filter((value): value is number => typeof value === "number");
        if (fieldDefIds.length < 2) {
            toast.error("Choose at least two fields.");
            return;
        }
        if (new Set(fieldDefIds).size !== fieldDefIds.length) {
            toast.error("Each field can only be used once in a duplicate rule.");
            return;
        }
        if (logicOperator === "CUSTOM" && !customLogicValidation.valid) {
            toast.error(customLogicValidation.message || "Fix the custom logic expression.");
            return;
        }

        const payload = {
            objectDefId: objectDef.id,
            name: name.trim(),
            description: description.trim() || undefined,
            isActive,
            createAction,
            editAction,
            logicOperator,
            logicExpression: logicOperator === "CUSTOM" ? logicExpression : undefined,
            fieldDefIds,
        };

        const result =
            mode === "create"
                ? await createDuplicateRule(payload)
                : await updateDuplicateRule(initial?.id ?? 0, payload);

        if (!result.success) {
            toast.error(result.error || "Failed to save duplicate rule.");
            return;
        }

        toast.success(mode === "create" ? "Duplicate rule created." : "Duplicate rule updated.");
        router.push(backHref);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle>{mode === "create" ? "New duplicate rule" : "Edit duplicate rule"}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Detect likely duplicate <span className="font-medium text-foreground">{objectDef.label}</span> records using multi-field matching.
                        </p>
                    </div>
                    <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Active" : "Inactive"}</Badge>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Rule name</Label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contact identity check" />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Rule status</p>
                            <p className="text-xs text-muted-foreground">Pause this rule without deleting it.</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" />
                    </div>
                    <div className="space-y-2">
                        <Label>On create</Label>
                        <Select value={createAction} onValueChange={(value) => setCreateAction(value as "NONE" | "WARN" | "BLOCK")}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="NONE">Do nothing</SelectItem>
                                <SelectItem value="WARN">Warn</SelectItem>
                                <SelectItem value="BLOCK">Block</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>On edit</Label>
                        <Select value={editAction} onValueChange={(value) => setEditAction(value as "NONE" | "WARN" | "BLOCK")}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="NONE">Do nothing</SelectItem>
                                <SelectItem value="WARN">Warn</SelectItem>
                                <SelectItem value="BLOCK">Block</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle>Matching Fields</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Each numbered condition means the field value must exactly match another record.
                        </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addCondition} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add field
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    {conditions.map((condition, index) => (
                        <div key={condition.id} className="rounded-xl border bg-card/70 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold">Condition {index + 1}</p>
                                    <p className="text-xs text-muted-foreground">Exact-match field comparison.</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeCondition(condition.id)}
                                    disabled={conditions.length <= 2}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="mt-4 space-y-2">
                                <Label>Field</Label>
                                <Select
                                    value={condition.fieldDefId ? String(condition.fieldDefId) : undefined}
                                    onValueChange={(value) => updateCondition(condition.id, Number(value))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select field..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.map((field) => (
                                            <SelectItem key={field.id} value={String(field.id)}>
                                                {field.label} ({field.type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ))}

                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        Strong duplicate keys are usually combinations like email + phone, first name + last name + birth date, or company name + website.
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Rule Logic</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>How conditions combine</Label>
                        <Select value={logicOperator} onValueChange={(value) => setLogicOperator(value as "ALL" | "ANY" | "CUSTOM")}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All conditions must match</SelectItem>
                                <SelectItem value="ANY">Any condition can match</SelectItem>
                                <SelectItem value="CUSTOM">Custom logic</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {logicOperator === "CUSTOM" && (
                        <div className="space-y-2">
                            <Label>Custom logic</Label>
                            <Input
                                value={logicExpression}
                                onChange={(event) => setLogicExpression(event.target.value)}
                                placeholder="(1 AND 2) OR 3"
                            />
                            {!customLogicValidation.valid && (
                                <p className="text-xs text-destructive">{customLogicValidation.message}</p>
                            )}
                        </div>
                    )}

                    <Separator />

                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        {conditions.map((condition, index) => (
                            <div key={condition.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                                <span className="font-medium text-foreground">{index + 1}.</span>{" "}
                                {condition.fieldDefId ? fieldMap.get(condition.fieldDefId)?.label ?? "Unknown field" : "Select a field"}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="flex gap-4 border-t border-border/50 pt-4">
                <Button type="button" onClick={handleSubmit}>
                    {mode === "create" ? "Create Rule" : "Save Changes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}
