import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppForm } from "@/components/admin/apps/app-form";
import { notFound } from "next/navigation";

export default async function EditAppPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);
    const { id } = await params;

    // Fetch Available Objects
    const availableObjects = await db.objectDefinition.findMany({
        where: { organizationId },
        select: { id: true, label: true, apiName: true },
        orderBy: { label: "asc" },
    });

    // Handle "New" case
    if (id === "new") {
        return (
            <div className="p-6">
                <AppForm availableObjects={availableObjects} />
            </div>
        );
    }

    const appId = parseInt(id);
    if (isNaN(appId)) notFound();

    // Fetch App Data
    const app = await db.appDefinition.findUnique({
        where: { id: appId, organizationId },
        include: {
            navItems: {
                orderBy: { sortOrder: "asc" },
            },
            widgets: {
                orderBy: { sortOrder: "asc" },
            },
        },
    });

    if (!app) notFound();

    return (
        <div className="p-6">
            <AppForm initialData={app} availableObjects={availableObjects} />
        </div>
    );
}
