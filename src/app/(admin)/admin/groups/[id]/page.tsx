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
import { AssignGroupMemberDialog } from "@/components/admin/groups/assign-group-member-dialog";
import { RemoveGroupMemberButton } from "@/components/admin/groups/remove-group-member-button";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const { id } = await params;
    const groupId = parseInt(id, 10);
    if (isNaN(groupId)) return notFound();

    const organizationId = Number(session.user.organizationId ?? NaN);

    const group = await db.group.findUnique({
        where: { id: groupId, organizationId },
        include: {
            users: true,
        },
    });

    if (!group) return notFound();

    const availableUsers = await db.user.findMany({
        where: {
            organizationId,
            OR: [
                { groupId: null },
                { groupId: { not: groupId } },
            ],
        },
        select: { id: true, name: true, email: true, username: true },
        orderBy: { name: "asc" },
    });

    const userOptions = availableUsers.map(u => ({
        id: String(u.id),
        label: `${u.name || u.email || `User #${u.id}`} (@${u.username})`,
    }));

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
                    <p className="text-muted-foreground">{group.description}</p>
                </div>
                <AssignGroupMemberDialog groupId={group.id} users={userOptions} />
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {group.users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{user.name || `User #${user.id}`}</span>
                                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <RemoveGroupMemberButton
                                        userId={user.id}
                                        userLabel={`${user.name || `User #${user.id}`} (@${user.username})`}
                                        userEmail={user.email}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                        {group.users.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No users in this group yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
