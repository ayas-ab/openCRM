import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DuplicateRuleForm } from "@/components/admin/duplicate-rules/duplicate-rule-form";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function DuplicateRuleDetailPage({
    params,
}: {
    params: Promise<{ objectId: string; ruleId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId, ruleId } = await params;
    const objectDefId = parseInt(objectId, 10);
    const duplicateRuleId = parseInt(ruleId, 10);

    if (Number.isNaN(objectDefId) || Number.isNaN(duplicateRuleId)) return notFound();

    const rule = await db.duplicateRule.findFirst({
        where: {
            id: duplicateRuleId,
            organizationId,
            objectDefId,
            objectDef: { apiName: { not: USER_OBJECT_API_NAME } },
        },
        include: {
            objectDef: {
                select: {
                    id: true,
                    label: true,
                    apiName: true,
                    fields: {
                        where: {
                            type: { in: ["Text", "Email", "Phone", "Date", "Url", "Picklist", "Lookup"] },
                        },
                        select: {
                            id: true,
                            label: true,
                            apiName: true,
                            type: true,
                        },
                        orderBy: { label: "asc" },
                    },
                },
            },
            conditions: {
                select: {
                    fieldDefId: true,
                },
                orderBy: { sortOrder: "asc" },
            },
        },
    });

    if (!rule) return notFound();

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={`/admin/duplicate-rules/${objectDefId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Duplicate Rules</p>
                    <h1 className="text-2xl font-bold tracking-tight">Edit rule for {rule.objectDef.label}</h1>
                </div>
            </div>

            <DuplicateRuleForm
                mode="edit"
                objectDef={{
                    id: rule.objectDef.id,
                    label: rule.objectDef.label,
                    apiName: rule.objectDef.apiName,
                }}
                fields={rule.objectDef.fields}
                initial={{
                    id: rule.id,
                    name: rule.name,
                    description: rule.description,
                    isActive: rule.isActive,
                    createAction: rule.createAction,
                    editAction: rule.editAction,
                    logicOperator: rule.logicOperator as "ALL" | "ANY" | "CUSTOM",
                    logicExpression: rule.logicExpression,
                    fieldDefIds: rule.conditions.map((condition) => condition.fieldDefId),
                }}
                backHref={`/admin/duplicate-rules/${objectDefId}`}
            />
        </div>
    );
}
