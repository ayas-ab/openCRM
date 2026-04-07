import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/standard/layout/app-header";
import { StandardSidebar } from "@/components/standard/layout/standard-sidebar";
import { getAvailableApps, getReadableObjectIds } from "@/lib/permissions";
import { getUserCompanionRecordId } from "@/lib/user-companion";

export default async function AppIdLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ appApiName: string }>;
}) {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const { appApiName } = await params;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);
    const isAdmin = user.userType === "admin";
    const userId = parseInt(user.id);

    // Fetch available apps based on permissions
    const apps = await getAvailableApps(userId, organizationId, user.userType);
    const currentApp = apps.find((app) => app.apiName === appApiName);

    // If app is invalid or user doesn't have access, redirect to first available app
    if (!currentApp) {
        if (apps.length > 0) {
            redirect(`/app/${apps[0].apiName}/dashboard`);
        }
        // If no apps available, redirect to a "no apps" page or show error
        redirect("/no-apps");
    }

    // Fetch Nav Items for current App
    const allNavItems = await db.appNavItem.findMany({
        where: { appId: currentApp.id },
        include: { objectDef: true },
        orderBy: { sortOrder: "asc" },
    });

    const readableObjectIds = new Set(await getReadableObjectIds(userId, organizationId));
    const navItems = allNavItems.filter((item) => readableObjectIds.has(item.objectDefId));
    const profileRecordId = await getUserCompanionRecordId(db, organizationId, userId);
    const profileHref = profileRecordId ? `/app/${currentApp.apiName}/user/${profileRecordId}` : undefined;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AppHeader
                apps={apps}
                currentAppApiName={currentApp.apiName}
                user={user}
                navItems={navItems}
                isAdmin={isAdmin}
                profileHref={profileHref}
            />
            <div className="flex min-h-0 flex-1">
                <StandardSidebar currentAppApiName={currentApp.apiName} navItems={navItems} />
                <main className="min-w-0 flex-1 overflow-auto bg-muted/10 p-4 md:p-6">
                    <div className="mx-auto w-full max-w-7xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
