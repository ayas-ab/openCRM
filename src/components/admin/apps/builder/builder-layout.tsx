"use client";

import { useEffect } from "react";
import { AppDefinition, ObjectDefinition } from "@prisma/client";
import { DEFAULT_WIDGET_COLOR, useBuilderStore, WidgetConfig, validateWidget } from "./builder-store";
import { WidgetToolbox } from "./widget-toolbox";
import { Canvas } from "./canvas";
import { WidgetConfigDialog } from "./widget-config-dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { saveDashboardLayout } from "@/actions/admin/admin-actions";

interface BuilderLayoutProps {
    appDef: AppDefinition;
    initialWidgets: any[];
    availableObjects: Partial<ObjectDefinition>[];
    availableQueues: { id: number; name: string }[];
}

export function BuilderLayout({ appDef, initialWidgets, availableObjects, availableQueues }: BuilderLayoutProps) {
    const { setWidgets, widgets, selectedWidgetId } = useBuilderStore();

    useEffect(() => {
        // Map DB widgets to Store widgets
        const sortedWidgets = [...initialWidgets].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const mappedWidgets: WidgetConfig[] = sortedWidgets.map((w) => {
            const config = (w.config as any) || {};
            const layout = (w.layout as any) || {};
            return {
                id: w.id.toString(),
                type: w.type as any,
                title: w.title,
                colSpan: layout.colSpan || 4,
                objectDefId: w.objectDefId || config.objectDefId,
                aggregation: config.aggregation,
                valueFieldDefId: config.valueFieldDefId,
                chartType: config.chartType,
                groupByFieldDefId: config.groupByFieldDefId,
                fieldDefIds: config.fieldDefIds || [],
                systemFields: config.systemFields || [],
                limit: config.limit || 5,
                sortFieldDefId: config.sortFieldDefId,
                sortSystemField: config.sortSystemField,
                sortDirection: config.sortDirection || "desc",
                filters: config.filters || [],
                filterLogic: config.filterLogic || "ALL",
                filterExpression: config.filterExpression,
                colorTheme: config.colorTheme || "default",
                icon: config.icon,
                color: config.color || DEFAULT_WIDGET_COLOR,
                ownerScope: config.ownerScope || "any",
                ownerQueueId: config.ownerQueueId,
            } as WidgetConfig;
        });

        setWidgets(mappedWidgets);
    }, [initialWidgets, setWidgets]);

    const handleSave = async () => {
        const invalid = widgets.filter((w) => validateWidget(w).length > 0);
        if (invalid.length > 0) {
            toast.error("Fix required fields before saving.");
            return;
        }
        try {
            const result = await saveDashboardLayout(appDef.id, widgets);
            if (result.success) {
                toast.success("Dashboard saved successfully");
            } else {
                toast.error(result.error || "Failed to save");
            }
        } catch (err) {
            toast.error("An error occurred while saving");
        }
    };

    return (
        <div className="h-screen w-full flex flex-col bg-slate-50">
            {/* Header */}
            <header className="h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/apps/${appDef.id}`}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="font-semibold text-lg">{appDef.name} Dashboard Builder</h1>
                        <p className="text-xs text-muted-foreground">Drag widgets • Click to configure</p>
                    </div>
                </div>
                <Button onClick={handleSave} className="gap-2 shadow-md" disabled={widgets.some((w) => validateWidget(w).length > 0)}>
                    <Save className="h-4 w-4" />
                    Save Dashboard
                </Button>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar: Toolbox */}
                <aside className="w-72 border-r bg-white flex flex-col shrink-0 shadow-sm">
                    <div className="p-4 border-b bg-slate-50">
                        <h2 className="font-semibold">Widget Library</h2>
                        <p className="text-xs text-muted-foreground mt-1">Drag onto canvas</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <WidgetToolbox />
                    </div>
                </aside>

                {/* Center: Canvas */}
                <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
                    <div className="max-w-7xl mx-auto p-8">
                        <div className="bg-white rounded-xl shadow-lg border p-6 min-h-[600px]">
                            <Canvas />
                        </div>
                    </div>
                </main>

                {/* Right Sidebar: Inspector */}
                <aside className="w-[420px] border-l bg-white flex flex-col shrink-0 shadow-sm">
                    <div className="p-4 border-b bg-slate-50">
                        <h2 className="font-semibold">Inspector</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            {selectedWidgetId ? "Configure the selected widget" : "Select a widget to edit"}
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <WidgetConfigDialog
                            open={Boolean(selectedWidgetId)}
                            onOpenChange={() => {}}
                            availableObjects={availableObjects}
                            availableQueues={availableQueues}
                        />
                    </div>
                </aside>
            </div>
        </div>
    );
}
