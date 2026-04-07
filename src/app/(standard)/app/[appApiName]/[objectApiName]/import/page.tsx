import { auth } from "@/auth";
import { db } from "@/lib/db";
import { hasSystemPermission, checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ImportForm } from "@/components/standard/import/import-form";
import { ImportJobDeleteButton } from "@/components/standard/import/import-job-delete-button";

export default async function BulkImportPage({
    params,
}: {
    params: Promise<{ appApiName: string; objectApiName: string }>;
}) {
    const { appApiName, objectApiName } = await params;
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);
    const userId = parseInt(user.id);

    const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
    const canCreate = await checkPermission(userId, organizationId, objectApiName, "create");
    const canEdit = await checkPermission(userId, organizationId, objectApiName, "edit");
    const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");

    if (!canRead) {
        notFound();
    }

    if (!canDataLoad) {
        return (
            <div className="p-6 max-w-3xl">
                <h1 className="text-2xl font-semibold tracking-tight">Bulk Insert / Update</h1>
                <p className="mt-2 text-muted-foreground">
                    You do not have permission to use data loading. Ask an admin to grant the
                    "Data Loading" system permission.
                </p>
                <div className="mt-6">
                    <Button asChild variant="outline">
                        <Link href={`/app/${appApiName}/${objectApiName}`}>Back to list</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const objectDef = await db.objectDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: objectApiName,
            },
        },
        include: {
            fields: {
                orderBy: { label: "asc" },
            },
        },
    });

    if (!objectDef) {
        notFound();
    }

    const externalIdField = objectDef.fields.find((field) => field.isExternalId);
    const hasExternalId = Boolean(externalIdField);
    const canImportAccess = canCreate || canEdit;
    const canImport = hasExternalId && canImportAccess;

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Bulk Insert / Update</h1>
                <p className="text-muted-foreground">
                    Import records for <span className="font-medium text-foreground">{objectDef.label}</span> using CSV.
                </p>
            </div>

            {!hasExternalId && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    This object does not have an External ID field. Bulk import/update is disabled until an External ID is set.
                </div>
            )}

            {!canImportAccess && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    You need Create or Edit permission on this object to run bulk imports.
                </div>
            )}

            <div className={`rounded-xl border bg-white shadow-sm p-6 space-y-6 ${!canImport ? "opacity-60" : ""}`}>
                <div>
                    <h2 className="text-lg font-semibold">Import file</h2>
                    <p className="text-sm text-muted-foreground">
                        File fields are ignored. Picklist values use <code>api name</code>. Max 500 rows per import.
                    </p>
                </div>
                <ImportForm
                    appApiName={appApiName}
                    objectApiName={objectApiName}
                    canImport={canImport}
                    canCreate={canCreate}
                    canEdit={canEdit}
                />
            </div>

            <div className={`rounded-xl border bg-white shadow-sm p-6 space-y-2 ${!canImport ? "opacity-60" : ""}`}>
                <h2 className="text-lg font-semibold">Field mapping</h2>
                <p className="text-sm text-muted-foreground">
                    CSV headers must match field API names.
                </p>
            </div>

            <div className={`rounded-xl border bg-white shadow-sm p-6 space-y-2 ${!canImport ? "opacity-60" : ""}`}>
                <h2 className="text-lg font-semibold">Validation</h2>
                <p className="text-sm text-muted-foreground">
                    External ID is required for each row. Lookup values match by the target object's External ID.
                </p>
                <p className="text-sm text-muted-foreground">
                    Validation rules and duplicate rules also run during import. Blocking duplicates fail the row; warning duplicates still import and are flagged in the job results.
                </p>
            </div>

            <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Previous Imports</h2>
                    <span className="text-sm text-muted-foreground">Last 10 jobs</span>
                </div>
                <ImportJobsTable
                    objectDefId={objectDef.id}
                    organizationId={organizationId}
                    appApiName={appApiName}
                    objectApiName={objectApiName}
                />
            </div>

            <div>
                <Button asChild variant="outline">
                        <Link href={`/app/${appApiName}/${objectApiName}`}>Back to list</Link>
                    </Button>
            </div>
        </div>
    );
}

async function ImportJobsTable({
    objectDefId,
    organizationId,
    appApiName,
    objectApiName,
}: {
    objectDefId: number;
    organizationId: number;
    appApiName: string;
    objectApiName: string;
}) {
    const jobs = await db.importJob.findMany({
        where: { organizationId, objectDefId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            id: true,
            fileName: true,
            mode: true,
            status: true,
            totalRows: true,
            successCount: true,
            errorCount: true,
            createdAt: true,
        },
    });

    if (jobs.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No imports yet.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                    <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium">File</th>
                        <th className="px-3 py-2 text-left font-medium">Mode</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                        <th className="px-3 py-2 text-right font-medium">Success</th>
                        <th className="px-3 py-2 text-right font-medium">Errors</th>
                            <th className="px-3 py-2 text-right font-medium">Created</th>
                            <th className="px-3 py-2 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} className="border-b last:border-0">
                                <td className="px-3 py-2">{job.fileName}</td>
                                <td className="px-3 py-2">{job.mode}</td>
                                <td className="px-3 py-2">
                                    <Link
                                        href={`/app/${appApiName}/${objectApiName}/import/${job.id}`}
                                        className="text-primary hover:underline"
                                    >
                                        {job.status}
                                    </Link>
                                </td>
                                <td className="px-3 py-2 text-right">{job.totalRows}</td>
                                <td className="px-3 py-2 text-right">{job.successCount}</td>
                                <td className="px-3 py-2 text-right">
                                    {job.errorCount > 0 ? (
                                        <Link
                                            href={`/app/${appApiName}/${objectApiName}/import/${job.id}`}
                                            className="text-destructive font-medium hover:underline"
                                        >
                                            {job.errorCount}
                                        </Link>
                                    ) : (
                                        job.errorCount
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    {job.createdAt.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <ImportJobDeleteButton
                                        jobId={job.id}
                                        objectApiName={objectApiName}
                                    />
                                </td>
                            </tr>
                        ))}
                </tbody>
            </table>
        </div>
    );
}
