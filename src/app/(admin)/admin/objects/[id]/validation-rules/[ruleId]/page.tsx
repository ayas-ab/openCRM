import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ValidationRuleForm, ValidationRuleFormValues } from "@/components/admin/objects/validation-rule-form";

export default async function ValidationRulePage({
    params,
}: {
    params: Promise<{ id: string; ruleId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const { id, ruleId } = await params;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const objectId = parseInt(id);
    if (isNaN(objectId)) notFound();

    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectId, organizationId },
        include: {
            fields: {
                orderBy: { createdAt: "asc" },
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
            },
        },
    });

    if (!objectDef) notFound();

    const permissionSets = await db.permissionSet.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    let initialValues: ValidationRuleFormValues | undefined;

    if (ruleId !== "new") {
        const ruleIdNum = parseInt(ruleId);
        if (isNaN(ruleIdNum)) notFound();

        const rule = await db.validationRule.findFirst({
            where: {
                id: ruleIdNum,
                objectDef: {
                    organizationId,
                },
            },
            include: {
                conditions: {
                    orderBy: { createdAt: "asc" },
                    include: {
                        fieldDef: true,
                        compareField: true,
                        permissionSet: true,
                    },
                },
            },
        });

        if (!rule) notFound();

        if (rule.objectDefId !== objectDef.id) {
            notFound();
        }

        initialValues = {
            id: rule.id,
            name: rule.name,
            description: rule.description ?? "",
            logicOperator: (rule.logicOperator as any) ?? "ALL",
            logicExpression: rule.logicExpression ?? "",
            errorPlacement: (rule.errorPlacement as any) ?? "toast",
            errorFieldId: rule.errorFieldId ?? null,
            errorMessage: rule.errorMessage,
            isActive: rule.isActive,
            conditions: rule.conditions.map((condition) => ({
                id: condition.id.toString(),
                conditionType: condition.systemField === "currentUserPermissionSetId" ? "currentUserPermission" : "field",
                fieldDefId: condition.systemField === "currentUserPermissionSetId" ? null : condition.fieldDefId ?? null,
                operator: condition.operator,
                compareSource: (condition.compareSource as any) ?? "value",
                compareValue: condition.compareValue ?? "",
                compareFieldId: condition.compareFieldId ?? null,
                permissionSetId: condition.permissionSetId ?? null,
            })),
        };
    }

    return (
        <div className="p-6 space-y-6">
            <ValidationRuleForm
                objectId={objectDef.id}
                fields={objectDef.fields}
                permissionSets={permissionSets}
                initialValues={initialValues}
            />
        </div>
    );
}
