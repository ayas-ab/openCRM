import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordPageBuilder } from "@/components/admin/objects/record-page-builder";
import { normalizeRecordPageLayoutConfig } from "@/lib/record-page-layout";

export default async function RecordPageBuilderPage({
    params,
}: {
    params: Promise<{ id: string; layoutId: string }>;
}) {
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);

    const { id, layoutId } = await params;
    const objectId = parseInt(id);
    const layoutIdNum = parseInt(layoutId);

    if (isNaN(objectId) || isNaN(layoutIdNum)) {
        notFound();
    }

    // Resolve the layout by its own identity first. The object segment in the
    // URL is useful for canonical routing, but it should not be able to make a
    // valid layout page disappear if the layout row itself still exists.
    const layout = await db.recordPageLayout.findUnique({
        where: {
            id: layoutIdNum,
        },
        include: {
            objectDef: {
                include: {
                    fields: {
                        include: {
                            picklistOptions: { orderBy: { sortOrder: "asc" } },
                        },
                    },
                },
            },
        },
    });

    if (!layout || layout.organizationId !== organizationId) {
        notFound();
    }

    if (layout.objectDefId !== objectId) {
        redirect(`/admin/objects/${layout.objectDefId}/record-pages/${layout.id}`);
    }

    const permissionSets = await db.permissionSet.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    return (
        <div className="p-6 space-y-8 bg-slate-50/50 min-h-screen">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" className="bg-white" asChild>
                    <Link href={`/admin/objects/${objectId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{layout.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {layout.objectDef.label} Record Page
                    </p>
                </div>
            </div>

            <RecordPageBuilder
                layoutId={layout.id}
                layoutName={layout.name}
                layoutConfig={normalizeRecordPageLayoutConfig(
                    layout.config as any,
                    layout.objectDef.fields.map((field) => ({
                        id: field.id,
                        required: field.required,
                        type: field.type,
                    }))
                )}
                fields={layout.objectDef.fields.map((field) => ({
                    id: field.id,
                    label: field.label,
                    apiName: field.apiName,
                    type: field.type,
                    required: field.required,
                }))}
                permissionSets={permissionSets}
            />
        </div>
    );
}
