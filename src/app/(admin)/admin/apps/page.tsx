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
import { Settings2, Plus } from "lucide-react";

export default async function AppsPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const apps = await db.appDefinition.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">App Manager</h1>
                    <p className="text-muted-foreground">
                        Create and manage apps to organize your objects.
                    </p>
                </div>
                <Button asChild className="shadow-sm">
                    <Link href="/admin/apps/new">
                        <Plus className="mr-2 h-4 w-4" />
                        New App
                    </Link>
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {apps.map((app) => (
                    <div key={app.id} className="group relative overflow-hidden rounded-xl border bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-indigo-100">
                        {/* Card Background Gradient Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <div className="relative space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="h-10 w-10 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                                    {/* Placeholder Icon - could add an icon field to app definition later */}
                                    {/* Using 'Layout' icon as generic app icon */}
                                    <Settings2 className="h-5 w-5" />
                                </div>
                                <Button asChild variant="ghost" size="sm" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-indigo-600">
                                    <Link href={`/admin/apps/${app.id}`}>
                                        <Settings2 className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-700 transition-colors">
                                    <Link href={`/admin/apps/${app.id}`} className="focus:outline-none">
                                        <span className="absolute inset-0" aria-hidden="true" />
                                        {app.name}
                                    </Link>
                                </h3>
                                <p className="text-sm text-slate-500 mt-1 line-clamp-2 pr-4">{app.description || "No description provided."}</p>
                            </div>

                            <div className="pt-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                                <span>Application</span>
                            </div>
                        </div>
                    </div>
                ))}

                {apps.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed p-12 text-center text-muted-foreground bg-slate-50/50">
                        <div className="mx-auto h-12 w-12 bg-white rounded-full border shadow-sm flex items-center justify-center mb-4">
                            <Plus className="h-6 w-6 text-slate-400" />
                        </div>
                        <h3 className="font-medium text-slate-900">No apps created</h3>
                        <p className="mt-1 text-sm">Get started by creating your first application.</p>
                        <Button asChild variant="link" className="mt-2 text-indigo-600">
                            <Link href="/admin/apps/new">
                                Create App
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
