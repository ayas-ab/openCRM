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
import { CreateAssignmentRuleDialog } from "@/components/admin/assignment-rules/create-assignment-rule-dialog";
import { AssignmentRuleActions } from "@/components/admin/assignment-rules/assignment-rule-actions";
import { AssignmentRuleOrderControls } from "@/components/admin/assignment-rules/assignment-rule-order-controls";

export default async function AssignmentRulesObjectPage({ params }: { params: Promise<{ objectId: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { objectId } = await params;
    const objectDefId = parseInt(objectId, 10);

    if (isNaN(objectDefId)) return notFound();

    const [objectDef, rules, users, queues] = await Promise.all([
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
        db.assignmentRule.findMany({
            where: { organizationId, objectDefId },
            include: { targetUser: true, targetQueue: true },
            orderBy: { sortOrder: "asc" },
        }),
        db.user.findMany({
            where: { organizationId },
            select: { id: true, name: true, email: true, username: true },
            orderBy: { name: "asc" },
        }),
        db.queue.findMany({
            where: { organizationId },
            select: {
                id: true,
                name: true,
            },
            orderBy: { name: "asc" },
        }),
    ]);

    if (!objectDef) return notFound();

    const userOptions = users.map((user) => ({
        id: user.id,
        label: `${user.name || user.email || `User #${user.id}`} (@${user.username})`,
    }));

    const queueOptions = queues.map((queue) => ({
        id: queue.id,
        label: queue.name,
    }));

    const ruleIds = rules.map((rule) => rule.id);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/admin/assignment-rules">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{objectDef.label} Assignment Rules</h1>
                    <p className="text-sm text-muted-foreground">
                        Rules are evaluated top to bottom; first match wins.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    Use the arrows to change priority order.
                </div>
                <CreateAssignmentRuleDialog
                    objects={[objectDef]}
                    users={userOptions}
                    queues={queueOptions}
                    fixedObject={objectDef}
                    fields={objectDef.fields}
                />
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Order</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Target</TableHead>
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
                                        <AssignmentRuleOrderControls
                                            objectDefId={objectDef.id}
                                            ruleIds={ruleIds}
                                            index={index}
                                        />
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">
                                    <Link href={`/admin/assignment-rules/${objectDef.id}/${rule.id}`} className="hover:underline">
                                        {rule.name}
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    {rule.targetType === "USER"
                                        ? `${rule.targetUser?.name || rule.targetUser?.email || `User #${rule.targetUserId}`} (@${rule.targetUser?.username || "unknown"})`
                                        : rule.targetQueue?.name || `Queue #${rule.targetQueueId}`}
                                </TableCell>
                                <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
                                <TableCell>
                                    <AssignmentRuleActions ruleId={rule.id} isActive={rule.isActive} />
                                </TableCell>
                            </TableRow>
                        ))}
                        {rules.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No assignment rules yet. Create one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
