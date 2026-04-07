import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { SharingRuleActions } from "@/components/admin/sharing-rules/sharing-rule-actions";
import { SharingRuleOrderControls } from "@/components/admin/sharing-rules/sharing-rule-order-controls";

export default async function SharingRulesObjectPage({ params }: { params: Promise<{ objectId: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId } = await params;
    const objectDefId = parseInt(objectId, 10);

    if (isNaN(objectDefId)) return notFound();

    const [objectDef, rules] = await Promise.all([
        db.objectDefinition.findUnique({
            where: { id: objectDefId, organizationId },
            select: { id: true, label: true, apiName: true },
        }),
        db.sharingRule.findMany({
            where: { organizationId, objectDefId },
            include: { targetGroup: true },
            orderBy: { sortOrder: "asc" },
        }),
    ]);

    if (!objectDef) return notFound();

    const ruleIds = rules.map((rule) => rule.id);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/admin/sharing-rules">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{objectDef.label} Sharing Rules</h1>
                    <p className="text-sm text-muted-foreground">
                        Rules are evaluated top to bottom; each match grants access.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    Use the arrows to change priority order.
                </div>
                <Button asChild>
                    <Link href={`/admin/sharing-rules/${objectDef.id}/new`}>New Rule</Link>
                </Button>
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Order</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>Access</TableHead>
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
                                        <SharingRuleOrderControls
                                            objectDefId={objectDef.id}
                                            ruleIds={ruleIds}
                                            index={index}
                                        />
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">
                                    <Link href={`/admin/sharing-rules/${objectDef.id}/${rule.id}`} className="hover:underline">
                                        {rule.name}
                                    </Link>
                                </TableCell>
                                <TableCell>{rule.targetGroup?.name ?? "Unknown Group"}</TableCell>
                                <TableCell>{rule.accessLevel === "DELETE" ? "Edit/Delete" : rule.accessLevel}</TableCell>
                                <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
                                <TableCell>
                                    <SharingRuleActions ruleId={rule.id} isActive={rule.isActive} />
                                </TableCell>
                            </TableRow>
                        ))}
                        {rules.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No sharing rules yet. Create one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
