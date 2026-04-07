import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const OPERATOR_LABELS: Record<string, string> = {
    equals: "Equals",
    not_equals: "Not Equals",
    gt: "Greater Than",
    gte: "Greater Or Equal",
    lt: "Less Than",
    lte: "Less Or Equal",
    contains: "Contains",
    not_contains: "Does Not Contain",
    is_blank: "Is Blank",
    is_not_blank: "Is Not Blank",
};

type CriteriaFilter = {
    fieldDefId?: number;
    field?: string;
    operator?: string;
    value?: string;
};

type CriteriaPayload = {
    logic?: "ALL" | "ANY";
    filters?: CriteriaFilter[];
};

export default async function AssignmentRuleDetailPage({
    params,
}: {
    params: Promise<{ objectId: string; ruleId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId, ruleId } = await params;
    const objectDefId = parseInt(objectId, 10);
    const assignmentRuleId = parseInt(ruleId, 10);

    if (isNaN(objectDefId) || isNaN(assignmentRuleId)) return notFound();

    const rule = await db.assignmentRule.findUnique({
        where: { id: assignmentRuleId, organizationId },
        include: {
            objectDef: {
                include: {
                    fields: {
                        include: {
                            picklistOptions: {
                                select: { id: true, label: true, isActive: true },
                                orderBy: { sortOrder: "asc" },
                            },
                        },
                    },
                },
            },
            targetUser: true,
            targetQueue: true,
        },
    });

    if (!rule || rule.objectDefId !== objectDefId) return notFound();

    const criteria = (rule.criteria as CriteriaPayload | null) ?? {};
    const logic = criteria.logic || "ALL";
    const filters = criteria.filters || [];

    const fieldById = new Map(rule.objectDef.fields.map((field) => [field.id, field]));
    const fieldByApi = new Map(rule.objectDef.fields.map((field) => [field.apiName, field]));

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={`/admin/assignment-rules/${objectDefId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{rule.name}</h1>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Rule Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                        <div className="text-xs text-muted-foreground">Object</div>
                        <div className="text-sm font-medium">{rule.objectDef.label}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Target</div>
                        <div className="text-sm font-medium">
                            {rule.targetType === "USER"
                                ? `${rule.targetUser?.name || rule.targetUser?.email || `User #${rule.targetUserId}`} (@${rule.targetUser?.username || "unknown"})`
                                : rule.targetQueue?.name || `Queue #${rule.targetQueueId}`}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="text-sm font-medium">{rule.isActive ? "Active" : "Inactive"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Order</div>
                        <div className="text-sm font-medium">{rule.sortOrder}</div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Criteria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {filters.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No criteria set. This rule matches all records.</div>
                    ) : (
                        <>
                            <div className="text-xs text-muted-foreground">Match Logic: {logic}</div>
                            <div className="space-y-3">
                                {filters.map((filter, index) => {
                                    const field =
                                        filter.fieldDefId !== undefined
                                            ? fieldById.get(filter.fieldDefId)
                                            : filter.field
                                                ? fieldByApi.get(filter.field)
                                                : null;
                                    const operatorLabel = filter.operator ? OPERATOR_LABELS[filter.operator] || filter.operator : "Equals";
                                    const valueLabel =
                                        filter.operator === "is_blank" || filter.operator === "is_not_blank"
                                            ? "-"
                                            : field?.type === "Picklist"
                                                ? (field.picklistOptions || []).find(
                                                    (opt: any) => String(opt.id) === String(filter.value)
                                                )?.label ?? filter.value ?? ""
                                                : filter.value ?? "";

                                    return (
                                        <div key={`${field?.id ?? filter.field ?? index}`} className="rounded-lg border p-3">
                                            <div className="text-xs text-muted-foreground">Condition {index + 1}</div>
                                            <div className="text-sm font-medium">{field?.label ?? filter.field ?? "Unknown Field"}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {operatorLabel} {valueLabel && valueLabel !== "-" ? `"${valueLabel}"` : ""}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
