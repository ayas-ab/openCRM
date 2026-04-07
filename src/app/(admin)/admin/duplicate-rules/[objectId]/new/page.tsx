import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DuplicateRuleForm } from "@/components/admin/duplicate-rules/duplicate-rule-form";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function DuplicateRuleCreatePage({
    params,
}: {
    params: Promise<{ objectId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId } = await params;
    const objectDefId = parseInt(objectId, 10);

    if (Number.isNaN(objectDefId)) return notFound();

    const objectDef = await db.objectDefinition.findFirst({
        where: { id: objectDefId, organizationId, apiName: { not: USER_OBJECT_API_NAME } },
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
    });

    if (!objectDef) return notFound();

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={`/admin/duplicate-rules/${objectDef.id}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Duplicate Rules</p>
                    <h1 className="text-2xl font-bold tracking-tight">Create rule for {objectDef.label}</h1>
                </div>
            </div>

            <DuplicateRuleForm
                mode="create"
                objectDef={{ id: objectDef.id, label: objectDef.label, apiName: objectDef.apiName }}
                fields={objectDef.fields}
                backHref={`/admin/duplicate-rules/${objectDef.id}`}
            />
        </div>
    );
}
