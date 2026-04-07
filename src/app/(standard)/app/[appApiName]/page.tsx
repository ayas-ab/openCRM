import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvailableApps } from "@/lib/permissions";
import { db } from "@/lib/db";

export default async function AppPage({
    params,
}: {
    params: Promise<{ appApiName: string }>;
}) {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const { appApiName } = await params;
    const user = session.user as any;
    const userId = parseInt(user.id);
    const organizationId = parseInt(user.organizationId);
    const apps = await getAvailableApps(userId, organizationId, user.userType);
    const currentApp = apps.find((app) => app.apiName === appApiName);

    if (!currentApp) {
        // If appApiName is invalid (e.g. "/app/dashboard"), redirect to first available app
        if (apps.length > 0) {
            redirect(`/app/${apps[0].apiName}`);
        }
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold">No Apps Assigned</h1>
                <p className="text-muted-foreground mt-2">
                    You do not have access to any apps. Please contact your administrator.
                </p>
            </div>
        );
    }

    // Get first nav item for this app
    const firstNavItem = await db.appNavItem.findFirst({
        where: { appId: currentApp.id },
        include: { objectDef: true },
        orderBy: { sortOrder: "asc" },
    });

    if (firstNavItem) {
        redirect(`/app/${currentApp.apiName}/${firstNavItem.objectDef.apiName}`);
    }

    // Fallback: no nav items configured
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold">No objects configured for this app</h1>
            <p className="text-muted-foreground mt-2">
                Contact your administrator to configure navigation items.
            </p>
        </div>
    );
}
