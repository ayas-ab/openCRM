import { auth } from "@/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Shuffle, UserRound, Workflow } from "lucide-react";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function AssignmentRulesPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const objects = await db.objectDefinition.findMany({
        where: {
            organizationId,
            apiName: { not: USER_OBJECT_API_NAME },
        },
        select: {
            id: true,
            label: true,
            apiName: true,
            _count: { select: { assignmentRules: true } },
        },
        orderBy: { label: "asc" },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-amber-50 p-6 shadow-sm">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" />
                <div className="relative space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                            <ClipboardList className="h-6 w-6" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Assignment Rules</h1>
                            <p className="text-sm text-slate-600">
                                Route new records to users or queues the moment they’re created.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Create-time only</Badge>
                        <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">First match wins</Badge>
                        <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">Priority order</Badge>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                            <Workflow className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Routing Logic</p>
                            <p className="text-xs text-slate-600">
                                Use criteria to auto-assign new records.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <Shuffle className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Priority Order</p>
                            <p className="text-xs text-slate-600">
                                Drag the order to decide which rule runs first.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                            <UserRound className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Targeted Ownership</p>
                            <p className="text-xs text-slate-600">
                                Send records to a user or a queue instantly.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Object</TableHead>
                            <TableHead>Rules</TableHead>
                            <TableHead className="w-[140px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {objects.map((object) => (
                            <TableRow key={object.id}>
                                <TableCell className="font-medium">{object.label}</TableCell>
                                <TableCell>{object._count.assignmentRules}</TableCell>
                                <TableCell>
                                    <Link
                                        href={`/admin/assignment-rules/${object.id}`}
                                        className="text-sm text-primary hover:underline"
                                    >
                                        Manage
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                        {objects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    No objects found. Create an object first.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
