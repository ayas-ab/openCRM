import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission, hasSystemPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeCsv(value: string) {
    if (value.includes('"')) {
        value = value.replace(/"/g, '""');
    }
    if (value.includes(",") || value.includes("\n") || value.includes("\r")) {
        return `"${value}"`;
    }
    return value;
}

function sampleForField(field: any) {
    switch (field.type) {
        case "Text":
            return "Sample text";
        case "TextArea":
            return "Sample long text";
        case "Email":
            return "sample.user@example.com";
        case "Phone":
            return "+15551234567";
        case "Url":
            return "https://example.com";
        case "Number":
            {
                const options = field.options && !Array.isArray(field.options) ? field.options : {};
                const decimalPlaces =
                    typeof options?.decimalPlaces === "number"
                        ? Math.max(0, Math.floor(options.decimalPlaces))
                        : 0;
                if (decimalPlaces > 0) {
                    return `123.${"4".repeat(decimalPlaces)}`;
                }
                return "123";
            }
        case "Date":
            return "2024-01-01";
        case "DateTime":
            return "2024-01-01T09:30:00Z";
        case "Checkbox":
            return "true";
        case "Picklist": {
            const options = Array.isArray(field.picklistOptions) ? field.picklistOptions : [];
            const option = options[0];
            if (!option) return "";
            return option.apiName || option.label || "";
        }
        case "Lookup":
            return "EXT-LOOKUP-001";
        default:
            return "";
    }
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ appApiName: string; objectApiName: string }> }
) {
    try {
        const { objectApiName } = await params;
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
                    include: { picklistOptions: true },
                },
            },
        });

        if (!objectDef) {
            return NextResponse.json({ error: "Object not found" }, { status: 404 });
        }

        const fields = objectDef.fields.filter((field) => field.type !== "File");
        const externalIdField = fields.find((field) => field.isExternalId);
        const orderedFields = externalIdField
            ? [externalIdField, ...fields.filter((field) => field.id !== externalIdField.id)]
            : fields;

        const headers = orderedFields.map((field) => field.apiName);
        const sampleRow = orderedFields.map((field) =>
            field.isExternalId ? "EXT-001" : sampleForField(field)
        );

        const csv = [
            headers.map(escapeCsv).join(","),
            sampleRow.map((value) => escapeCsv(String(value ?? ""))).join(","),
        ].join("\n");

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${objectDef.apiName}-import-template.csv"`,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message ?? "Failed to generate template" }, { status: 500 });
    }
}
