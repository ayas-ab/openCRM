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
import { AddQueueMemberDialog } from "@/components/admin/queues/add-queue-member-dialog";
import { RemoveQueueMemberButton } from "@/components/admin/queues/remove-queue-member-button";

export default async function QueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const { id } = await params;
    const queueId = parseInt(id, 10);
    if (isNaN(queueId)) return notFound();

    const organizationId = Number(session.user.organizationId ?? NaN);

    const queue = await db.queue.findUnique({
        where: { id: queueId, organizationId },
        include: {
            members: {
                include: {
                    user: true,
                },
            },
        },
    });

    if (!queue) return notFound();

    const memberIds = new Set(queue.members.map(m => m.userId));
    const availableUsers = await db.user.findMany({
        where: {
            organizationId,
            id: { notIn: Array.from(memberIds) },
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
                    <h1 className="text-3xl font-bold tracking-tight">{queue.name}</h1>
                    <p className="text-muted-foreground">{queue.description}</p>
                </div>
                <AddQueueMemberDialog queueId={queue.id} users={userOptions} />
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
                        {queue.members.map((member) => (
                            <TableRow key={member.id}>
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{member.user.name || `User #${member.user.id}`}</span>
                                        <span className="text-xs text-muted-foreground">@{member.user.username}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{member.user.email}</TableCell>
                                <TableCell>
                                    <RemoveQueueMemberButton
                                        queueId={queue.id}
                                        userId={member.userId}
                                        memberName={member.user.name || `User #${member.user.id}`}
                                        queueName={queue.name}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                        {queue.members.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No members yet. Add users to this queue.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
