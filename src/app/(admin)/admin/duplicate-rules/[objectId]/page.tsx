import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DuplicateRuleActions } from "@/components/admin/duplicate-rules/duplicate-rule-actions";
import { DuplicateRuleOrderControls } from "@/components/admin/duplicate-rules/duplicate-rule-order-controls";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function DuplicateRulesObjectPage({ params }: { params: Promise<{ objectId: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId } = await params;
    const objectDefId = parseInt(objectId, 10);

    if (Number.isNaN(objectDefId)) return notFound();

    const [objectDef, rules] = await Promise.all([
        db.objectDefinition.findFirst({
            where: { id: objectDefId, organizationId, apiName: { not: USER_OBJECT_API_NAME } },
            select: { id: true, label: true },
        }),
        db.duplicateRule.findMany({
            where: { organizationId, objectDefId },
            include: {
                conditions: {
                    include: {
                        fieldDef: { select: { label: true } },
                    },
                    orderBy: { sortOrder: "asc" },
                },
            },
            orderBy: { sortOrder: "asc" },
        }),
    ]);

    if (!objectDef) return notFound();

    const ruleIds = rules.map((rule) => rule.id);

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/admin/duplicate-rules">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{objectDef.label} Duplicate Rules</h1>
                    <p className="text-sm text-muted-foreground">Rules are evaluated top to bottom during create and edit.</p>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Use the arrows to change rule priority order.</div>
                <Button asChild>
                    <Link href={`/admin/duplicate-rules/${objectDef.id}/new`}>New Rule</Link>
                </Button>
            </div>

            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Order</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Create</TableHead>
                            <TableHead>Edit</TableHead>
                            <TableHead>Fields</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[180px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.map((rule, index) => (
                            <TableRow key={rule.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">{index + 1}</span>
                                        <DuplicateRuleOrderControls objectDefId={objectDef.id} ruleIds={ruleIds} index={index} />
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">
                                    <Link href={`/admin/duplicate-rules/${objectDef.id}/${rule.id}`} className="hover:underline">
                                        {rule.name}
                                    </Link>
                                </TableCell>
                                <TableCell>{rule.createAction}</TableCell>
                                <TableCell>{rule.editAction}</TableCell>
                                <TableCell>
                                    {rule.conditions.map((condition) => condition.fieldDef.label).join(", ")}
                                </TableCell>
                                <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
                                <TableCell>
                                    <DuplicateRuleActions ruleId={rule.id} isActive={rule.isActive} />
                                </TableCell>
                            </TableRow>
                        ))}
                        {rules.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                                    No duplicate rules yet. Create one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
