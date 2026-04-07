import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { SharingRuleForm } from "@/components/admin/sharing-rules/sharing-rule-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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

export default async function SharingRuleDetailPage({
    params,
}: {
    params: Promise<{ objectId: string; ruleId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId, ruleId } = await params;
    const objectDefId = parseInt(objectId, 10);
    const sharingRuleId = parseInt(ruleId, 10);

    if (isNaN(objectDefId) || isNaN(sharingRuleId)) return notFound();

    const [rule, groups] = await Promise.all([
        db.sharingRule.findUnique({
            where: { id: sharingRuleId, organizationId },
            include: {
                objectDef: {
                    select: {
                        id: true,
                        label: true,
                        apiName: true,
                        fields: {
                            select: {
                                id: true,
                                label: true,
                                apiName: true,
                                type: true,
                                picklistOptions: {
                                    select: { id: true, label: true, isActive: true },
                                    orderBy: { sortOrder: "asc" },
                                },
                            },
                            orderBy: { label: "asc" },
                        },
                    },
                },
            },
        }),
        db.group.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),
    ]);

    if (!rule || rule.objectDefId !== objectDefId) return notFound();

    const criteria = (rule.criteria as CriteriaPayload | null) ?? {};

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={`/admin/sharing-rules/${objectDefId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sharing Rules</p>
                    <h1 className="text-2xl font-bold tracking-tight">Edit rule for {rule.objectDef.label}</h1>
                </div>
            </div>

            <SharingRuleForm
                mode="edit"
                objectDef={{
                    id: rule.objectDef.id,
                    label: rule.objectDef.label,
                    apiName: rule.objectDef.apiName,
                }}
                fields={rule.objectDef.fields}
                groups={groups}
                initial={{
                    id: rule.id,
                    name: rule.name,
                    description: rule.description,
                    targetGroupId: rule.targetGroupId,
                    accessLevel: rule.accessLevel,
                    isActive: rule.isActive,
                    criteria: {
                        logic: criteria.logic ?? "ALL",
                        expression: criteria.expression ?? "",
                        filters: criteria.filters ?? [],
                    },
                }}
                backHref={`/admin/sharing-rules/${objectDefId}`}
            />
        </div>
    );
}
