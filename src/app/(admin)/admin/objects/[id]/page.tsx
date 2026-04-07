import { auth } from "@/auth";
import { db } from "@/lib/db";
import { CreateFieldDialog } from "@/components/admin/objects/create-field-dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Info, Layers3, LayoutTemplate, ShieldCheck, TableProperties, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { EditFieldDialog } from "@/components/admin/objects/edit-field-dialog";
import { DeleteFieldButton } from "@/components/admin/objects/delete-field-button";
import { FieldWhereUsedButton } from "@/components/admin/objects/field-where-used-button";
import { DeleteObjectButton } from "@/components/admin/objects/delete-object-button";
import { DependencyList } from "@/components/admin/objects/dependency-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ValidationRulesPanel } from "@/components/admin/objects/validation-rules-panel";
import { ObjectIconCard } from "@/components/admin/objects/object-icon-card";
import { CreateRecordPageLayoutDialog } from "@/components/admin/objects/create-record-page-layout-dialog";
import { CreateRecordPageAssignmentDialog } from "@/components/admin/objects/create-record-page-assignment-dialog";
import { SetDefaultRecordPageLayoutButton } from "@/components/admin/objects/set-default-record-page-layout-button";
import { DeleteRecordPageAssignmentButton } from "@/components/admin/objects/delete-record-page-assignment-button";
import { DeleteRecordPageLayoutButton } from "@/components/admin/objects/delete-record-page-layout-button";
import { getObjectDeleteProtection } from "@/lib/metadata-dependencies";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function ObjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);
    const { id } = await params;
    const objectId = parseInt(id);

    if (isNaN(objectId)) notFound();

    // Fetch Object Definition
    const objectDef = await db.objectDefinition.findUnique({
        where: { id: objectId, organizationId },
        include: {
            fields: {
                orderBy: { createdAt: "asc" },
                include: {
                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                },
            },
            validationRules: {
                orderBy: { createdAt: "desc" },
                include: {
                    conditions: {
                        orderBy: { createdAt: "asc" },
                        include: {
                            fieldDef: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                            compareField: {
                                include: {
                                    picklistOptions: { orderBy: { sortOrder: "asc" } },
                                },
                            },
                            permissionSet: true,
                        },
                    },
                },
            },
        },
    });

    if (!objectDef) notFound();

    // Fetch all objects for Lookup options
    const allObjects = await db.objectDefinition.findMany({
        where: { organizationId },
        select: { id: true, label: true },
        orderBy: { label: "asc" },
    });

    const recordPageLayouts = await db.recordPageLayout.findMany({
        where: { organizationId, objectDefId: objectId },
        orderBy: { updatedAt: "desc" },
    });

    const recordPageAssignments = await db.recordPageAssignment.findMany({
        where: { organizationId, objectDefId: objectId },
        include: {
            app: true,
            permissionSet: true,
            layout: true,
        },
        orderBy: { updatedAt: "desc" },
    });

    const apps = await db.appDefinition.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    const permissionSets = await db.permissionSet.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    const {
        dependencies: objectDeleteDependencies,
        allDependencies: objectDependencies,
        recordCount,
    } = await getObjectDeleteProtection(organizationId, objectDef.id);
    const blockingDependencyIds = new Set(objectDeleteDependencies.map((dependency) => dependency.id));
    const informationalDependencies = objectDependencies.filter(
        (dependency) => !blockingDependencyIds.has(dependency.id)
    );
    const fieldDependencyMap = new Map<number, typeof objectDependencies>();
    objectDependencies.forEach((dependency) => {
        if (!dependency.fieldDefId) return;
        const bucket = fieldDependencyMap.get(dependency.fieldDefId) ?? [];
        bucket.push(dependency);
        fieldDependencyMap.set(dependency.fieldDefId, bucket);
    });

    return (
        <div className="p-6 space-y-8 bg-slate-50/50 min-h-screen">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" className="bg-white" asChild>
                    <Link href="/admin/objects">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{objectDef.label}</h1>
                        <Badge variant="outline" className="text-xs font-normal bg-white">
                            {objectDef.isSystem ? "Standard Object" : "Custom Object"}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{objectDef.apiName}</span>
                    </div>
                </div>
                </div>
                {!objectDef.isSystem ? (
                    <DeleteObjectButton
                        objectDefId={objectDef.id}
                        label={objectDef.label}
                        isSystem={objectDef.isSystem}
                        initialDependencies={objectDeleteDependencies}
                        initialRecordCount={recordCount}
                    />
                ) : null}
            </div>

            <ObjectIconCard
                objectId={objectDef.id}
                currentIcon={objectDef.icon}
                label={objectDef.label}
                pluralLabel={objectDef.pluralLabel}
                description={objectDef.description}
                notifyOnAssignment={objectDef.notifyOnAssignment}
                enableChatter={objectDef.enableChatter}
                isUserObject={objectDef.apiName === USER_OBJECT_API_NAME}
            />

            <Tabs defaultValue="fields" className="space-y-6">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-2 xl:grid-cols-4">
                    <TabsTrigger
                        value="fields"
                        className="group h-full min-h-[72px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-indigo-200 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-900 data-[state=active]:shadow-none"
                    >
                        <div className="flex h-full w-full items-center">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors group-data-[state=active]:bg-indigo-100 group-data-[state=active]:text-indigo-700">
                                    <TableProperties className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">Fields & Relationships</div>
                                </div>
                            </div>
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="validation"
                        className="group h-full min-h-[72px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-emerald-200 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:shadow-none"
                    >
                        <div className="flex h-full w-full items-center">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors group-data-[state=active]:bg-emerald-100 group-data-[state=active]:text-emerald-700">
                                    <Wrench className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">Validation Rules</div>
                                </div>
                            </div>
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="recordpages"
                        className="group h-full min-h-[72px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-violet-200 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-900 data-[state=active]:shadow-none"
                    >
                        <div className="flex h-full w-full items-center">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors group-data-[state=active]:bg-violet-100 group-data-[state=active]:text-violet-700">
                                    <LayoutTemplate className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">Record Pages</div>
                                </div>
                            </div>
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="usedin"
                        className="group h-full min-h-[72px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-amber-200 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-950 data-[state=active]:shadow-none"
                    >
                        <div className="flex h-full w-full items-center">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors group-data-[state=active]:bg-amber-100 group-data-[state=active]:text-amber-700">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold">Delete Impact</div>
                                </div>
                            </div>
                        </div>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="fields" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Fields & Relationships</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Configure the schema for this object. Changes are reflected instantly in forms and record lists.
                                </p>
                            </div>
                            <CreateFieldDialog objectDefId={objectDef.id} availableObjects={allObjects} />
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Label</TableHead>
                                            <TableHead>API Name</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Required</TableHead>
                                            <TableHead className="w-[170px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {objectDef.fields.map((field) => (
                                            <TableRow key={field.id}>
                                                <TableCell className="font-medium">{field.label}</TableCell>
                                                <TableCell className="font-mono text-xs">{field.apiName}</TableCell>
                                                <TableCell className="space-x-2">
                                                    <Badge variant="outline">{field.type}</Badge>
                                                    {field.type === "Lookup" && field.lookupTargetId && (
                                                        <span className="text-xs text-muted-foreground">
                                                            Ref: {allObjects.find(o => o.id === field.lookupTargetId)?.label}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {field.required ? (
                                                        <Badge variant="default" className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
                                                            Required
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">Optional</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <FieldWhereUsedButton
                                                            label={field.label}
                                                            dependencies={fieldDependencyMap.get(field.id) ?? []}
                                                        />
                                                        <EditFieldDialog field={field} availableObjects={allObjects} />
                                                        <DeleteFieldButton
                                                            fieldId={field.id}
                                                            objectDefId={objectDef.id}
                                                            label={field.label}
                                                            apiName={field.apiName}
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {objectDef.fields.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                    No fields defined.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="validation">
                    <ValidationRulesPanel
                        objectId={objectDef.id}
                        fields={objectDef.fields}
                        validationRules={objectDef.validationRules}
                    />
                </TabsContent>

                <TabsContent value="recordpages" className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Record Page Layouts</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Manage layout templates for this object.
                                </p>
                            </div>
                            <CreateRecordPageLayoutDialog objectDefId={objectDef.id} />
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4 rounded-lg border bg-slate-50/80 p-4 text-sm text-slate-700">
                                <div className="flex items-start gap-3">
                                    <Info className="mt-0.5 h-4 w-4 text-slate-500" />
                                    <div>
                                        <p className="font-medium text-slate-900">Default layout</p>
                                        <p className="mt-1 text-slate-600">
                                            If no assignment matches, users see the default layout for this object.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Layout</TableHead>
                                            <TableHead>Default</TableHead>
                                            <TableHead>Updated</TableHead>
                                            <TableHead className="w-[260px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recordPageLayouts.map((layout) => (
                                            <TableRow key={layout.id}>
                                                <TableCell className="font-medium">{layout.name}</TableCell>
                                                <TableCell>
                                                    {layout.isDefault ? (
                                                        <Badge variant="outline">Default</Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {layout.updatedAt.toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="outline" size="sm" asChild>
                                                            <Link href={`/admin/objects/${objectDef.id}/record-pages/${layout.id}`}>
                                                                Open Builder
                                                            </Link>
                                                        </Button>
                                                        <SetDefaultRecordPageLayoutButton
                                                            layoutId={layout.id}
                                                            isDefault={layout.isDefault}
                                                        />
                                                        <DeleteRecordPageLayoutButton
                                                            layoutId={layout.id}
                                                            label={`${layout.name}`}
                                                            isDefault={layout.isDefault}
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {recordPageLayouts.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                    No record page layouts yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Record Page Assignments</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Choose which layout applies to each app or permission set.
                                </p>
                            </div>
                            <CreateRecordPageAssignmentDialog
                                objectDefId={objectDef.id}
                                apps={apps}
                                layouts={recordPageLayouts.map((layout) => ({ id: layout.id, name: layout.name }))}
                                permissionSets={permissionSets}
                            />
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4 rounded-lg border bg-slate-50/80 p-4 text-sm text-slate-700">
                                <div className="flex items-start gap-3">
                                    <Info className="mt-0.5 h-4 w-4 text-slate-500" />
                                    <div>
                                        <p className="font-medium text-slate-900">How assignments are matched</p>
                                        <p className="mt-1 text-slate-600">
                                            Lower numbers win. If nothing matches, the default layout is used.
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            If a user has multiple permission sets that match at the same priority, the system
                                            picks the first assignment by ID. That can feel random, so avoid overlapping rules.
                                        </p>
                                        <ol className="mt-3 space-y-1 text-slate-700">
                                            <li className="flex items-center gap-2">
                                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">1</span>
                                                App + Permission
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">2</span>
                                                App only
                                            </li>
                                        </ol>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                            <TableRow>
                                                <TableHead>App</TableHead>
                                                <TableHead>Permission Set</TableHead>
                                                <TableHead className="w-[100px]">Priority</TableHead>
                                                <TableHead>Layout</TableHead>
                                                <TableHead className="w-[120px]">Actions</TableHead>
                                            </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[...recordPageAssignments]
                                            .map((assignment) => {
                                            const hasPermissionSet = Boolean(assignment.permissionSetId);
                                            const priority = hasPermissionSet ? 1 : 2;

                                            return {
                                                assignment,
                                                priority,
                                            };
                                        })
                                        .sort((a, b) => {
                                            if (a.priority !== b.priority) return a.priority - b.priority;
                                            return a.assignment.id - b.assignment.id;
                                        })
                                        .map(({ assignment, priority }) => (
                                            <TableRow key={assignment.id}>
                                                <TableCell className="font-medium">{assignment.app.name}</TableCell>
                                                <TableCell>
                                                    {assignment.permissionSet?.name || "Any"}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className="bg-slate-900 text-white">#{priority}</Badge>
                                                </TableCell>
                                                <TableCell>{assignment.layout.name}</TableCell>
                                                <TableCell>
                                                    <DeleteRecordPageAssignmentButton
                                                        assignmentId={assignment.id}
                                                        label={`${assignment.app.name} -> ${assignment.layout.name}`}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {recordPageAssignments.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                    No record page assignments yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="usedin" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Delete Impact</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                This view separates references that actually block deleting this object from metadata that only belongs to this object itself.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-lg bg-red-100 p-2 text-red-700">
                                            <AlertTriangle className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-red-950">Blocking references</p>
                                            <p className="text-2xl font-bold tracking-tight text-red-900">
                                                {objectDeleteDependencies.length}
                                            </p>
                                            <p className="text-xs leading-5 text-red-800">
                                                External references that must be removed before delete.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                                            <Layers3 className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-amber-950">Object-owned metadata</p>
                                            <p className="text-2xl font-bold tracking-tight text-amber-900">
                                                {informationalDependencies.length}
                                            </p>
                                            <p className="text-xs leading-5 text-amber-800">
                                                Removed together with the object. These do not block delete.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-lg bg-white p-2 text-slate-700 shadow-sm">
                                            <ShieldCheck className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-900">Records</p>
                                            <p className="text-2xl font-bold tracking-tight text-slate-900">
                                                {recordCount}
                                            </p>
                                            <p className="text-xs leading-5 text-slate-600">
                                                Existing records always block object delete until removed.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
                                <div className="flex items-start gap-3">
                                    <Info className="mt-0.5 h-4 w-4 text-slate-500" />
                                    <div className="space-y-1">
                                        <p className="font-medium text-slate-900">How to read this tab</p>
                                        <p className="leading-6">
                                            <span className="font-medium text-red-900">Blocks object delete</span> lists external references that must be removed first.
                                            <span className="mx-1 text-slate-300">|</span>
                                            <span className="font-medium text-amber-900">Belongs to this object</span> lists metadata that is deleted together with the object and is shown only for context.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {recordCount > 0 ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    This object currently has {recordCount} record{recordCount === 1 ? "" : "s"}.
                                    Records must be removed before the object can be deleted.
                                </div>
                            ) : null}
                            <div className="rounded-xl border border-red-200 bg-red-50/40">
                                <div className="border-b border-red-200 px-5 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold text-red-950">Blocks object delete</h3>
                                            <p className="mt-1 text-sm text-red-800">
                                                External references that must be removed before this object can be deleted.
                                            </p>
                                        </div>
                                        <Badge className="border-red-200 bg-white text-red-800 hover:bg-white">
                                            {objectDeleteDependencies.length} blocker{objectDeleteDependencies.length === 1 ? "" : "s"}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="px-5 py-4">
                                    <DependencyList
                                        dependencies={objectDeleteDependencies}
                                        emptyMessage="No metadata references are currently blocking object delete."
                                    />
                                </div>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/40">
                                <div className="border-b border-amber-200 px-5 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold text-amber-950">Belongs to this object</h3>
                                            <p className="mt-1 text-sm text-amber-800">
                                                Metadata that is deleted together with the object and is shown for context only.
                                            </p>
                                        </div>
                                        <Badge className="border-amber-200 bg-white text-amber-800 hover:bg-white">
                                            {informationalDependencies.length} item{informationalDependencies.length === 1 ? "" : "s"}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="px-5 py-4">
                                    <DependencyList
                                        dependencies={informationalDependencies}
                                        emptyMessage="No object-owned metadata references were indexed."
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
