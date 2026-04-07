import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ objectApiName: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user as any;
        const userId = parseInt(user.id);
        const organizationId = parseInt(user.organizationId);
        const { objectApiName } = await params;

        if (Number.isNaN(userId) || Number.isNaN(organizationId)) {
            return NextResponse.json({ error: "Invalid session" }, { status: 400 });
        }

        const objectDef = await db.objectDefinition.findFirst({
            where: {
                apiName: objectApiName,
                organizationId,
            },
            include: {
                fields: {
                    orderBy: { label: "asc" },
                    include: {
                        picklistOptions: { orderBy: { sortOrder: "asc" } },
                    },
                },
            },
        });

        if (!objectDef) {
            return NextResponse.json({ error: "Object not found" }, { status: 404 });
        }

        if (user.userType !== "admin") {
            const canRead = await checkPermission(userId, organizationId, objectApiName, "read");
            if (!canRead) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        return NextResponse.json({ fields: objectDef.fields });
    } catch (error) {
        console.error("Fetch fields error:", error);
        return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 });
    }
}
