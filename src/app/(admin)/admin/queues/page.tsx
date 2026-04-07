import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Bell, Inbox, UserCheck, Workflow } from "lucide-react";
import { CreateQueueDialog } from "@/components/admin/queues/create-queue-dialog";
import { Badge } from "@/components/ui/badge";

export default async function QueuesPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const queues = await db.queue.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
            _count: { select: { members: true } },
        },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-amber-50 p-6 shadow-sm">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-200/40 blur-2xl" />
                <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
                                <Inbox className="h-6 w-6" />
                            </span>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Queues</h1>
                                <p className="text-sm text-slate-600">
                                    Assignment buckets where new work waits to be picked up.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Read-only for members</Badge>
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Notifications on arrival</Badge>
                            <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">Global across objects</Badge>
                        </div>
                    </div>
                    <CreateQueueDialog />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                            <Workflow className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Assignment Rules</p>
                            <p className="text-xs text-slate-600">
                                Records can be routed into queues on create.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <Bell className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Instant Alerts</p>
                            <p className="text-xs text-slate-600">
                                Members get notified when work arrives.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                            <UserCheck className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Claim to Edit</p>
                            <p className="text-xs text-slate-600">
                                Queue ownership stays read-only until reassigned.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Members</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {queues.map((queue) => (
                            <TableRow key={queue.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <Inbox className="h-4 w-4 text-muted-foreground" />
                                        {queue.name}
                                    </div>
                                </TableCell>
                                <TableCell>{queue.description}</TableCell>
                                <TableCell>{queue._count.members}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/admin/queues/${queue.id}`}>Manage</Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {queues.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No queues found. Create one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
