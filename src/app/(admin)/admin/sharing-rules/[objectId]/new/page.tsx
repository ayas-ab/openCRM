import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { SharingRuleForm } from "@/components/admin/sharing-rules/sharing-rule-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function SharingRuleCreatePage({
    params,
}: {
    params: Promise<{ objectId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId } = await params;
    const objectDefId = parseInt(objectId, 10);

    if (isNaN(objectDefId)) return notFound();

    const [objectDef, groups] = await Promise.all([
        db.objectDefinition.findUnique({
            where: { id: objectDefId, organizationId },
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
        }),
        db.group.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),
    ]);

    if (!objectDef) return notFound();

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={`/admin/sharing-rules/${objectDef.id}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sharing Rules</p>
                    <h1 className="text-2xl font-bold tracking-tight">Create rule for {objectDef.label}</h1>
                </div>
            </div>

            <SharingRuleForm
                mode="create"
                objectDef={{ id: objectDef.id, label: objectDef.label, apiName: objectDef.apiName }}
                fields={objectDef.fields}
                groups={groups}
                backHref={`/admin/sharing-rules/${objectDef.id}`}
            />
        </div>
    );
}
