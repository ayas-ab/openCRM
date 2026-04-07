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
import { Eye, Layers, ShieldCheck, Share2 } from "lucide-react";

export default async function SharingRulesPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const objects = await db.objectDefinition.findMany({
        where: { organizationId },
        select: {
            id: true,
            label: true,
            apiName: true,
            _count: { select: { sharingRules: true } },
        },
        orderBy: { label: "asc" },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-rose-50 via-white to-amber-50 p-6 shadow-sm">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-200/40 blur-2xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" />
                <div className="relative space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                            <Share2 className="h-6 w-6" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sharing Rules</h1>
                            <p className="text-sm text-slate-600">
                                Share user-owned records with groups using criteria-based access.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">User-owned only</Badge>
                        <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Access levels</Badge>
                        <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">Object-specific</Badge>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                            <Eye className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Visibility Control</p>
                            <p className="text-xs text-slate-600">
                                Grant read or edit access by criteria.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <ShieldCheck className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Permission Aware</p>
                            <p className="text-xs text-slate-600">
                                Access still respects object permissions.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                            <Layers className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Group Audience</p>
                            <p className="text-xs text-slate-600">
                                Shares are targeted to your defined groups.
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
                                <TableCell>{object._count.sharingRules}</TableCell>
                                <TableCell>
                                    <Link
                                        href={`/admin/sharing-rules/${object.id}`}
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
