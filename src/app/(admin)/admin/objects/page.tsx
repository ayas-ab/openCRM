import { auth } from "@/auth";
import { db } from "@/lib/db";
import { CreateObjectDialog } from "@/components/admin/objects/create-object-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Settings2 } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { RebuildDependencyIndexButton } from "@/components/admin/objects/rebuild-dependency-index-button";

export default async function ObjectsPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const objects = await db.objectDefinition.findMany({
        where: { organizationId },
        orderBy: { label: "asc" },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Object Manager</h1>
                    <p className="text-muted-foreground">
                        Manage standard and custom objects for your organization.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <RebuildDependencyIndexButton />
                    <CreateObjectDialog />
                </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Label</TableHead>
                            <TableHead>API Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="hidden md:table-cell">Description</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {objects.map((obj) => {
                            const Icon = (Icons as any)[obj.icon || "Box"] || Icons.Box;
                            return (
                                <TableRow key={obj.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <TableCell>
                                        <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        <Link href={`/admin/objects/${obj.id}`} className="hover:underline hover:text-indigo-600 decoration-indigo-600/30 underline-offset-4">
                                            {obj.label}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500">{obj.apiName}</TableCell>
                                    <TableCell>
                                        <Badge variant={obj.isSystem ? "secondary" : "outline"} className={cn("font-normal", obj.isSystem ? "bg-slate-100 text-slate-600" : "bg-white text-slate-600 border-slate-200")}>
                                            {obj.isSystem ? "Standard" : "Custom"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[300px] truncate">
                                        {obj.description || "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Link href={`/admin/objects/${obj.id}`}>
                                                <Settings2 className="h-4 w-4 text-slate-500" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {objects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                                            <Icons.Box className="h-6 w-6 text-slate-300" />
                                        </div>
                                        <p>No objects found. Create one to get started.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
