"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Info, Plus, ArrowRight } from "lucide-react";

type FieldInfo = {
    id: number;
    label: string;
    apiName: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string }>;
};

type ValidationCondition = {
    id: number;
    operator: string;
    compareSource: "value" | "field" | string;
    compareValue?: string | null;
    compareFieldId?: number | null;
    systemField?: string | null;
    permissionSet?: { id: number; name: string } | null;
    fieldDef?: FieldInfo | null;
    compareField?: FieldInfo | null;
};

type ValidationRule = {
    id: number;
    name: string;
    description?: string | null;
    errorMessage: string;
    errorPlacement?: "toast" | "inline" | string | null;
    isActive: boolean;
    logicOperator: "ALL" | "ANY" | "CUSTOM" | string;
    logicExpression?: string | null;
    conditions: ValidationCondition[];
};

interface ValidationRulesPanelProps {
    objectId: number;
    fields: FieldInfo[];
    validationRules: ValidationRule[];
}

const OPERATOR_LABELS: Record<string, string> = {
    equals: "equals",
    not_equals: "does not equal",
    gt: "is greater than",
    gte: "is greater than or equal to",
    lt: "is less than",
    lte: "is less than or equal to",
    contains: "contains",
    not_contains: "does not contain",
    is_blank: "is blank",
    is_not_blank: "is not blank",
    character_length_lt: "character length <",
    character_length_lte: "character length <=",
    character_length_eq: "character length =",
    character_length_gte: "character length >=",
    character_length_gt: "character length >",
    has_permission: "has permission",
    not_has_permission: "does not have permission",
};

function formatCustomLogicExpression(expression: string | null | undefined) {
    if (!expression) return "";
    return expression
        .replace(/\s*&&\s*/g, " AND ")
        .replace(/\s*\|\|\s*/g, " OR ")
        .replace(/!\s*/g, "NOT ")
        .replace(/\s+/g, " ")
        .trim();
}

function isBlankOperator(operator: string) {
    return operator === "is_blank" || operator === "is_not_blank";
}

export function ValidationRulesPanel({ objectId, fields, validationRules }: ValidationRulesPanelProps) {
    void fields;

    const renderCondition = (condition: ValidationCondition) => {
        if (condition.systemField === "currentUserPermissionSetId") {
            const permissionLabel = condition.permissionSet?.name ?? "permission set";
            const operator = OPERATOR_LABELS[condition.operator] || condition.operator;
            return (
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Current user</span> {operator}{" "}
                    <span className="font-medium text-foreground">{permissionLabel}</span>
                </p>
            );
        }

        const fieldLabel = condition.fieldDef ? condition.fieldDef.label : "Field";
        const operator = OPERATOR_LABELS[condition.operator] || condition.operator;

        let comparator: ReactNode = "";
        if (condition.compareSource === "value") {
            if (condition.fieldDef?.type === "Picklist") {
                const option = condition.fieldDef.picklistOptions?.find((item) => String(item.id) === condition.compareValue);
                comparator = option?.label || "option";
            } else {
                comparator = condition.compareValue || "-";
            }
        } else if (condition.compareSource === "field") {
            comparator = condition.compareField?.label || "Other field";
        }

        return (
            <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fieldLabel}</span> {operator}
                {!isBlankOperator(condition.operator) ? (
                    <>
                        {" "}
                        <span className="font-medium text-foreground">{comparator}</span>
                    </>
                ) : null}
            </p>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">Validation Rules</h3>
                    <p className="text-sm text-muted-foreground">
                        Guardrails that fire before save. When criteria are met, the record is blocked.
                    </p>
                </div>
                <Button asChild className="gap-2 shadow-sm">
                    <Link href={`/admin/objects/${objectId}/validation-rules/new`}>
                        <Plus className="h-4 w-4" />
                        Add Rule
                    </Link>
                </Button>
            </div>

            <TooltipProvider>
                <div className="space-y-4">
                    {validationRules.length === 0 && (
                        <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/5 p-12 text-center text-muted-foreground">
                            <div className="mb-4 flex justify-center">
                                <div className="rounded-full bg-muted/50 p-3">
                                    <Info className="h-6 w-6 opacity-50" />
                                </div>
                            </div>
                            <h4 className="text-sm font-medium text-foreground">No rules defined</h4>
                            <p className="text-sm">Create a validation rule to enforce data quality standards.</p>
                        </div>
                    )}
                    {validationRules.map((rule) => (
                        <div
                            key={rule.id}
                            className="group flex flex-col gap-5 rounded-xl border border-border/50 bg-card p-5 shadow-sm transition-all hover:border-sidebar-primary/30 hover:shadow-md md:flex-row md:items-start md:justify-between"
                        >
                            <div className="flex-1 space-y-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h4 className="text-base font-semibold transition-colors group-hover:text-primary">{rule.name}</h4>
                                    <Badge variant={rule.isActive ? "default" : "secondary"} className="h-5 px-2 text-[10px]">
                                        {rule.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                    <Badge variant="outline" className="h-5 bg-muted/30 px-2 text-[10px]">
                                        {rule.logicOperator === "ALL" ? "AND" : rule.logicOperator === "ANY" ? "OR" : "CUSTOM"}
                                    </Badge>
                                </div>
                                {rule.description ? (
                                    <p className="font-light leading-relaxed text-muted-foreground/80">{rule.description}</p>
                                ) : null}

                                <div className="mt-2 space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3">
                                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conditions</div>
                                    <div className="space-y-1.5">
                                        {rule.conditions.map((condition) => (
                                            <div key={condition.id} className="flex items-start gap-2 text-sm">
                                                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                                                <div className="text-muted-foreground/90">{renderCondition(condition)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {rule.logicOperator === "CUSTOM" && rule.logicExpression ? (
                                        <div className="mt-2 border-t border-dashed border-border/40 pt-2">
                                            <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                                                <span className="text-[10px] font-semibold uppercase">Logic:</span>
                                                <span className="rounded bg-muted/50 px-1 py-0.5 text-foreground">
                                                    {formatCustomLogicExpression(rule.logicExpression)}
                                                </span>
                                            </p>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="flex items-center gap-2 rounded-lg border border-destructive/10 bg-destructive/5 px-3 py-2 text-sm text-destructive/90">
                                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-80">Error:</span>
                                    <span>{rule.errorMessage}</span>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" asChild className="transition-transform group-hover:translate-x-1">
                                <Link
                                    href={`/admin/objects/${objectId}/validation-rules/${rule.id}`}
                                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary"
                                >
                                    Manage
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        </div>
                    ))}
                </div>
            </TooltipProvider>
        </div>
    );
}
