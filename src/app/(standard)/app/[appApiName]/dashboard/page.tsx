import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { MetricWidget } from "@/components/standard/dashboard/metric-widget";
import { ListWidget } from "@/components/standard/dashboard/list-widget";
import { ChartWidget } from "@/components/standard/dashboard/chart-widget";
import { checkPermission } from "@/lib/permissions";

export default async function DashboardPage({
    params,
}: {
    params: Promise<{ appApiName: string }>;
}) {
    const session = await auth();
    const { appApiName } = await params;

    if (!session) {
        redirect("/login");
    }

    const app = await db.appDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId: parseInt((session?.user as any)?.organizationId),
                apiName: appApiName,
            },
        },
        include: {
            widgets: {
                orderBy: { sortOrder: "asc" },
                include: { objectDef: true },
            },
        },
    });

    if (!app) {
        return <div>App not found</div>;
    }

    // Filter widgets based on object permissions
    const userId = parseInt(session?.user?.id as string);
    const organizationId = parseInt((session?.user as any)?.organizationId);

    const widgetsWithAccess = await Promise.all(
        app.widgets.map(async (widget) => {
            const objectApiName = (widget as any).objectDef?.apiName;
            if (!objectApiName) return null;

            const hasRead = await checkPermission(userId, organizationId, objectApiName, "read");
            const hasViewAll = await checkPermission(userId, organizationId, objectApiName, "viewAll");

            return hasRead || hasViewAll ? widget : null;
        })
    );

    // Filter out null widgets
    const visibleWidgets = widgetsWithAccess.filter(w => w !== null);

    // Safety check just in case
    const safeWidgets = visibleWidgets.filter(w => w !== null && w !== undefined);

    return (
        <div className="space-y-8">
      

            <div className="grid gap-6 grid-cols-1 md:grid-cols-12">
                {/* Dynamic Widgets */}
                {safeWidgets.map((widget) => {
                    if (!widget) return null;
                    const rawConfig = widget.config as any;
                    const layout = widget.layout as any;
                    const config = {
                        ...rawConfig,
                        objectDefId: widget.objectDefId,
                    };

                    // Determine column span
                    // New System: colSpan (1-12)
                    // Legacy System: width ("25%", "50%", etc)

                    let colSpanClass = "md:col-span-4"; // Default fallback

                    if (layout?.colSpan) {
                        // Direct mapping for 1-12 grid
                        colSpanClass = `md:col-span-${layout.colSpan}`;
                    } else if (config.width) {
                        // Legacy mapping
                        if (config.width === "25%") colSpanClass = "md:col-span-3";
                        else if (config.width === "33%") colSpanClass = "md:col-span-4";
                        else if (config.width === "50%") colSpanClass = "md:col-span-6";
                        else if (config.width === "66%") colSpanClass = "md:col-span-8";
                        else if (config.width === "75%") colSpanClass = "md:col-span-9";
                        else if (config.width === "100%") colSpanClass = "md:col-span-12";
                    }

                    const wrapperClass = `col-span-1 ${colSpanClass}`;
                    const type = widget.type.toLowerCase();

                    if (type === "metric") {
                        return (
                            <div key={widget.id} className={wrapperClass}>
                                <MetricWidget
                                    title={widget.title}
                                    config={config}
                                />
                            </div>
                        );
                    }

                    if (type === "list") {
                        return (
                            <div key={widget.id} className={wrapperClass}>
                                <ListWidget
                                    title={widget.title}
                                    appApiName={appApiName}
                                    config={config}
                                />
                            </div>
                        );
                    }

                    if (type === "chart") {
                        return (
                            <div key={widget.id} className={wrapperClass}>
                                <ChartWidget
                                    title={widget.title}
                                    config={config}
                                />
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
}
