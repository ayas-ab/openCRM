import { auth } from "@/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Copy, Layers, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function DuplicateRulesPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const [objects, duplicateRuleCounts] = await Promise.all([
        db.objectDefinition.findMany({
            where: {
                organizationId,
                apiName: { not: USER_OBJECT_API_NAME },
            },
            select: {
                id: true,
                label: true,
                apiName: true,
            },
            orderBy: { label: "asc" },
        }),
        db.duplicateRule.groupBy({
            by: ["objectDefId"],
            where: { organizationId },
            _count: { _all: true },
        }),
    ]);

    const countByObjectId = new Map(
        duplicateRuleCounts.map((row) => [row.objectDefId, row._count._all])
    );

    return (
        <div className="space-y-6 p-6">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 shadow-sm">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-200/40 blur-2xl" />
                <div className="relative space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                            <Copy className="h-6 w-6" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Duplicate Rules</h1>
                            <p className="text-sm text-slate-600">
                                Detect likely duplicate records before messy data spreads.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Warn or block</Badge>
                        <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Object-specific</Badge>
                        <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">Multi-field matching</Badge>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                            <Sparkles className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Data Quality</p>
                            <p className="text-xs text-slate-600">Catch duplicates before users create more noise.</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                            <Layers className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Field Combos</p>
                            <p className="text-xs text-slate-600">Combine two or more exact-match fields into one rule.</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <ShieldAlert className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Safe Enforcement</p>
                            <p className="text-xs text-slate-600">Warnings and blocks still respect record visibility.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
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
                                <TableCell>{countByObjectId.get(object.id) ?? 0}</TableCell>
                                <TableCell>
                                    <Link href={`/admin/duplicate-rules/${object.id}`} className="text-sm text-primary hover:underline">
                                        Manage
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                        {objects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
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
