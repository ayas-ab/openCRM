import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission, hasSystemPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Prisma } from "@prisma/client";

export default async function ImportJobDetailPage({
    params,
}: {
    params: Promise<{ appApiName: string; objectApiName: string; jobId: string }>;
}) {
    const { appApiName, objectApiName, jobId } = await params;
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);
    const userId = parseInt(user.id);

    const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
    const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");
    if (!canRead || !canDataLoad) {
        notFound();
    }

    const jobIdNum = parseInt(jobId, 10);
    if (Number.isNaN(jobIdNum)) {
        notFound();
    }

    const job = await db.importJob.findFirst({
        where: {
            id: jobIdNum,
            organizationId,
            objectDef: {
                organizationId,
                apiName: objectApiName,
            },
        },
        select: {
            id: true,
            fileName: true,
            mode: true,
            status: true,
            totalRows: true,
            successCount: true,
            errorCount: true,
            completedAt: true,
            errorMessage: true,
        },
    });

    if (!job) {
        notFound();
    }

    const [failedRows, successRows] = await Promise.all([
        db.importRow.findMany({
            where: { jobId: job.id, errors: { not: Prisma.JsonNull } },
            orderBy: { rowIndex: "asc" },
            take: 200,
        }),
        db.importRow.findMany({
            where: { jobId: job.id, errors: { equals: Prisma.JsonNull } },
            orderBy: { rowIndex: "asc" },
            take: 200,
        }),
    ]);
    const warningCount = successRows.filter((row) => row.warnings !== null).length;

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Import Details</h1>
                <p className="text-muted-foreground">
                    {job.fileName} • {job.mode} • {job.status}
                </p>
            </div>

            {job.errorMessage && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {job.errorMessage}
                </div>
            )}

            <div className="rounded-xl border bg-white shadow-sm p-6 grid gap-4 md:grid-cols-4">
                <div>
                    <div className="text-xs uppercase text-muted-foreground">Total</div>
                    <div className="text-lg font-semibold">{job.totalRows}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-muted-foreground">Success</div>
                    <div className="text-lg font-semibold">{job.successCount}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-muted-foreground">Errors</div>
                    <div className="text-lg font-semibold text-destructive">{job.errorCount}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-muted-foreground">Warnings</div>
                    <div className="text-lg font-semibold text-amber-600">{warningCount}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-muted-foreground">Completed</div>
                    <div className="text-sm text-muted-foreground">
                        {job.completedAt ? job.completedAt.toLocaleString() : "In progress"}
                    </div>
                </div>
            </div>

            {warningCount > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    {warningCount} imported row{warningCount === 1 ? "" : "s"} matched duplicate warning rules. They were imported successfully, but should be reviewed.
                </div>
            )}

            <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Failed Rows (up to 200)</h2>
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/app/${appApiName}/${objectApiName}/import/${job.id}/errors`}>
                            Download Errors CSV
                        </Link>
                    </Button>
                </div>
                {failedRows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No failed rows.</div>
                ) : (
                    <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-muted-foreground">
                                <tr className="border-b">
                                    <th className="px-3 py-2 text-left font-medium">Row</th>
                                    <th className="px-3 py-2 text-left font-medium">Row Data</th>
                                    <th className="px-3 py-2 text-left font-medium">Errors</th>
                                </tr>
                            </thead>
                            <tbody>
                                {failedRows.map((row) => {
                                    const errors = (row.errors as any)?.messages ?? [];
                                    return (
                                        <tr key={row.id} className="border-b last:border-0">
                                            <td className="px-3 py-2">{row.rowIndex}</td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">
                                                <pre className="whitespace-pre-wrap">{JSON.stringify(row.rawData, null, 2)}</pre>
                                            </td>
                                            <td className="px-3 py-2">
                                                <ul className="list-disc pl-4 space-y-1">
                                                    {errors.map((message: string, idx: number) => (
                                                        <li key={idx}>{message}</li>
                                                    ))}
                                                </ul>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
                <h2 className="text-lg font-semibold">Successful Rows (up to 200)</h2>
                {successRows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No successful rows yet.</div>
                ) : (
                    <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-muted-foreground">
                                <tr className="border-b">
                                    <th className="px-3 py-2 text-left font-medium">Row</th>
                                    <th className="px-3 py-2 text-left font-medium">Row Data</th>
                                    <th className="px-3 py-2 text-left font-medium">Record</th>
                                    <th className="px-3 py-2 text-left font-medium">Warnings</th>
                                </tr>
                            </thead>
                            <tbody>
                                {successRows.map((row) => {
                                    const warnings = (row.warnings as any)?.messages ?? [];
                                    return (
                                    <tr key={row.id} className="border-b last:border-0">
                                        <td className="px-3 py-2">{row.rowIndex}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            <pre className="whitespace-pre-wrap">
                                                {JSON.stringify(row.rawData, null, 2)}
                                            </pre>
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.recordId ?? "-"}
                                        </td>
                                        <td className="px-3 py-2">
                                            {warnings.length === 0 ? (
                                                <span className="text-muted-foreground">-</span>
                                            ) : (
                                                <ul className="list-disc pl-4 space-y-1 text-amber-700">
                                                    {warnings.map((message: string, idx: number) => (
                                                        <li key={idx}>{message}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div>
                <Button asChild variant="outline">
                    <Link href={`/app/${appApiName}/${objectApiName}/import`}>Back to imports</Link>
                </Button>
            </div>
        </div>
    );
}
