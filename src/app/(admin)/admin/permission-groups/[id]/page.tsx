import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { AddPermissionSetToGroupDialog } from "@/components/admin/permissions/add-permission-set-to-group-dialog";
import { RemovePermissionSetFromGroupButton } from "@/components/admin/permissions/remove-permission-set-from-group-button";
import { DeletePermissionSetGroupButton } from "@/components/admin/permissions/delete-permission-set-group-button";
import { RemoveUserFromPermissionSetGroupButton } from "@/components/admin/permissions/remove-user-from-permission-set-group-button";

export default async function PermissionGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { id } = await params;
    const groupId = parseInt(id);

    if (isNaN(groupId)) notFound();

    const group = await db.permissionSetGroup.findUnique({
        where: { id: groupId, organizationId },
        include: {
            permissionSets: {
                include: {
                    permissionSet: true,
                },
            },
        },
    });

    if (!group) notFound();

    // Fetch available permission sets (not already in group)
    const existingIds = group.permissionSets.map(ps => ps.permissionSetId);
    const availablePermissionSets = await db.permissionSet.findMany({
        where: {
            organizationId,
            id: { notIn: existingIds }
        },
        orderBy: { name: "asc" },
    });

    const groupMemberships = await db.permissionSetGroupAssignment.findMany({
        where: {
            permissionSetGroupId: group.id,
            user: { organizationId },
        },
        include: {
            user: true,
        },
    });

    const memberUserIds = groupMemberships.map((membership) => membership.userId);
    const assignmentCounts = new Map<number, number>();

    if (memberUserIds.length > 0) {
        const groupSources = await db.permissionSetAssignmentSource.findMany({
            where: {
                sourceType: "GROUP",
                permissionSetGroupId: group.id,
                assignment: {
                    userId: { in: memberUserIds },
                    user: { organizationId },
                },
            },
            select: {
                assignment: { select: { userId: true } },
            },
        });

        groupSources.forEach((source) => {
            assignmentCounts.set(
                source.assignment.userId,
                (assignmentCounts.get(source.assignment.userId) ?? 0) + 1
            );
        });
    }

    const assignedUsers = groupMemberships
        .map((membership) => ({
            user: membership.user,
            count: assignmentCounts.get(membership.userId) ?? 0,
        }))
        .sort((a, b) => (a.user.name || "").localeCompare(b.user.name || ""));

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/permission-groups">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
                    <p className="text-muted-foreground">
                        {group.description || "No description provided."}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Included Permission Sets</h2>
                    <div className="flex flex-wrap gap-2">
                        <AddPermissionSetToGroupDialog groupId={group.id} availablePermissionSets={availablePermissionSets} />
                        <DeletePermissionSetGroupButton groupId={group.id} name={group.name} />
                    </div>
                </div>

                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {group.permissionSets.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-muted-foreground" />
                                            {member.permissionSet.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>{member.permissionSet.description}</TableCell>
                                    <TableCell>
                                        <RemovePermissionSetFromGroupButton
                                            groupId={group.id}
                                            permissionSetId={member.permissionSetId}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {group.permissionSets.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        No permission sets in this group.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Assigned Users</h2>
                </div>

                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead className="w-[160px]">Assignments</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assignedUsers.map(({ user, count }) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span>{user.name ?? user.email ?? "Unknown"}</span>
                                            <span className="text-xs text-muted-foreground">{user.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{count} set(s)</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <RemoveUserFromPermissionSetGroupButton
                                            groupId={group.id}
                                            userId={user.id}
                                            userName={user.name ?? user.email ?? "Unknown"}
                                            assignmentCount={count}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {assignedUsers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        No users assigned to this group.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
