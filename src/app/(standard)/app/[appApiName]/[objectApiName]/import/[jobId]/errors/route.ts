import { auth } from "@/auth";
import { formatCsvCell } from "@/lib/csv";
import { db } from "@/lib/db";
import { checkPermission, hasSystemPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ appApiName: string; objectApiName: string; jobId: string }> }
) {
    try {
        const { objectApiName, jobId } = await params;
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user as any;
        const organizationId = parseInt(user.organizationId);
        const userId = parseInt(user.id);

        const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
        if (!canRead) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");
        if (!canDataLoad) {
            return NextResponse.json({ error: "Data loading permission required" }, { status: 403 });
        }

        const jobIdNum = parseInt(jobId, 10);
        if (Number.isNaN(jobIdNum)) {
            return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
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
            include: {
                rows: {
                    where: { errors: { not: Prisma.JsonNull } },
                    orderBy: { rowIndex: "asc" },
                },
            },
        }) as Prisma.ImportJobGetPayload<{
            include: { rows: true };
        }> | null;

        if (!job) {
            return NextResponse.json({ error: "Import job not found" }, { status: 404 });
        }

        const fieldKeys = new Set<string>();
        for (const row of job.rows) {
            const raw = row.rawData as Record<string, any>;
            Object.keys(raw || {}).forEach((key) => fieldKeys.add(key));
        }
        const orderedKeys = Array.from(fieldKeys);

        const header = ["rowIndex", ...orderedKeys, "errors"];
        const lines = [header.map((value) => formatCsvCell(value)).join(",")];

        for (const row of job.rows) {
            const raw = row.rawData as Record<string, any>;
            const errorMessages = (row.errors as any)?.messages ?? [];
            const lineValues = [
                String(row.rowIndex),
                ...orderedKeys.map((key) => String(raw?.[key] ?? "")),
                errorMessages.join("; "),
            ];
            lines.push(lineValues.map((value) => formatCsvCell(value)).join(","));
        }

        const csv = lines.join("\n");

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="import-${job.id}-errors.csv"`,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message ?? "Failed to build error CSV" }, { status: 500 });
    }
}
