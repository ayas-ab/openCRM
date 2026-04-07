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
import Link from "next/link";
import { ArrowLeft, CircleHelp, LayoutGrid } from "lucide-react";
import { ObjectPermissionToggle } from "@/components/admin/permissions/object-permission-toggle";
import { AppPermissionToggle } from "@/components/admin/permissions/app-permission-toggle";
import { SystemPermissionToggle } from "@/components/admin/permissions/system-permission-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const objectPermissionHelp: Record<string, string> = {
    Read: "Lets users open records they already have row-level access to.",
    Create: "Lets users create new records for this object.",
    Edit: "Lets users edit records they are allowed to update through ownership, sharing, or broader access.",
    Delete: "Lets users delete records they are allowed to remove through ownership, sharing, or broader access.",
    "View All": "Lets users read every record for this object, ignoring ownership and sharing.",
    "Modify All": "Lets users read, edit, and delete every record for this object, ignoring ownership and sharing.",
    "Modify List Views": "Lets users create, change, and remove list views for this object.",
};

function PermissionHeader({ label }: { label: keyof typeof objectPermissionHelp }) {
    return (
        <div className="flex items-center justify-center gap-1.5">
            <span>{label}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={`What does ${label} mean?`}
                    >
                        <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 text-sm leading-relaxed">
                    {objectPermissionHelp[label]}
                </TooltipContent>
            </Tooltip>
        </div>
    );
}

export default async function PermissionSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);
    const { id } = await params;
    const permissionSetId = parseInt(id);

    if (isNaN(permissionSetId)) notFound();

    const permissionSet = await db.permissionSet.findUnique({
        where: { id: permissionSetId, organizationId },
    });

    if (!permissionSet) notFound();

    // 1. Fetch Object Permissions
    const objectDefs = await db.objectDefinition.findMany({
        where: { organizationId },
        orderBy: { label: "asc" },
        include: {
            permissions: {
                where: { permissionSetId },
            },
        },
    });

    // 2. Fetch App Permissions
    const apps = await db.appDefinition.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
            permissions: {
                where: { permissionSetId },
            },
        },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/permissions">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{permissionSet.name}</h1>
                    <p className="text-muted-foreground">{permissionSet.description}</p>
                </div>
            </div>

            <Tabs defaultValue="objects" className="w-full space-y-6">
                <TabsList className="flex w-full justify-start border-b bg-transparent p-0 h-auto">
                    <TabsTrigger
                        value="objects"
                        className="rounded-none border-b-2 border-transparent px-4 py-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                    >
                        Object Permissions
                    </TabsTrigger>
                    <TabsTrigger
                        value="apps"
                        className="rounded-none border-b-2 border-transparent px-4 py-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                    >
                        App Permissions
                    </TabsTrigger>
                    <TabsTrigger
                        value="system"
                        className="rounded-none border-b-2 border-transparent px-4 py-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                    >
                        System Permissions
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="objects" className="space-y-4 mt-4">
                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Object</TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Read" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Create" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Edit" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Delete" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="View All" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Modify All" /></TableHead>
                                    <TableHead className="text-center"><PermissionHeader label="Modify List Views" /></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {objectDefs.map((obj) => {
                                    const perm = obj.permissions[0] || {};
                                    const isLockedUserPermission = (field: string) =>
                                        obj.apiName === USER_OBJECT_API_NAME &&
                                        ["allowCreate", "allowEdit", "allowDelete", "allowModifyAll"].includes(field);
                                    return (
                                        <TableRow key={obj.id}>
                                            <TableCell className="font-medium">{obj.label}</TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowRead"
                                                    initialValue={perm.allowRead || false}
                                                    disabled={false}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowCreate"
                                                    initialValue={perm.allowCreate || false}
                                                    disabled={isLockedUserPermission("allowCreate")}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowEdit"
                                                    initialValue={perm.allowEdit || false}
                                                    disabled={isLockedUserPermission("allowEdit")}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowDelete"
                                                    initialValue={perm.allowDelete || false}
                                                    disabled={isLockedUserPermission("allowDelete")}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowViewAll"
                                                    initialValue={perm.allowViewAll || false}
                                                    disabled={false}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowModifyAll"
                                                    initialValue={perm.allowModifyAll || false}
                                                    disabled={isLockedUserPermission("allowModifyAll")}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ObjectPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    objectDefId={obj.id}
                                                    field="allowModifyListViews"
                                                    initialValue={perm.allowModifyListViews || false}
                                                    disabled={false}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="apps" className="space-y-4 mt-4">
                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>App Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-[100px] text-center">Access</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {apps.map((app) => {
                                    const hasAccess = app.permissions.length > 0;
                                    return (
                                        <TableRow key={app.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                                                    {app.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>{app.description}</TableCell>
                                            <TableCell className="text-center">
                                                <AppPermissionToggle
                                                    permissionSetId={permissionSetId}
                                                    appId={app.id}
                                                    initialValue={hasAccess}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {apps.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            No apps found. Create one in App Manager.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="system" className="space-y-4 mt-4">
                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Permission</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-[120px] text-center">Enabled</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">Data Loading</TableCell>
                                    <TableCell>
                                        Allows bulk insert/update imports for records (CSV).
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <SystemPermissionToggle
                                            permissionSetId={permissionSetId}
                                            field="allowDataLoading"
                                            initialValue={permissionSet.allowDataLoading || false}
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
