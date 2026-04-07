"use client";
import { WIDGET_THEMES } from "@/lib/ui-themes";
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getMetricData } from "@/actions/standard/dashboard-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricWidgetProps {
    title: string;
    config: {
        objectDefId: number;
        aggregation: string;
        valueFieldDefId?: number;
        filters?: any[];
        filterLogic?: string;
        filterExpression?: string;
        ownerScope?: "any" | "mine" | "queue";
        ownerQueueId?: number | null;
        colorTheme?: string;
        color?: string;
        icon?: string;
    };
}

export function MetricWidget({ title, config }: MetricWidgetProps) {
    const [value, setValue] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (!config.objectDefId) return;
            try {
                const result = await getMetricData(config.objectDefId, config);
                setValue(result);
            } catch (error) {
                console.error("Failed to fetch metric", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [
        config.objectDefId,
        config.aggregation,
        JSON.stringify(config.filters),
        config.filterLogic,
        config.filterExpression,
        config.ownerScope,
        config.ownerQueueId,
    ]);

    const Icon = config.icon && (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        ? (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        : null;

    const themeClasses = WIDGET_THEMES[config.colorTheme || "default"] || WIDGET_THEMES["default"];

    return (
        <Card
            className={cn("py-0 shadow-sm transition-all hover:shadow-md", themeClasses)}
            style={config.color ? { borderColor: config.color } : undefined}
        >
            <div
                className="rounded-t-[inherit]"
                style={
                    config.color
                        ? {
                              backgroundColor: `${config.color}1a`,
                          }
                        : undefined
                }
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6 border-b border-border/10">
                    <CardTitle className="text-sm font-medium opacity-90">
                        {title}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {config.color && (
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: config.color }}
                            />
                        )}
                        {Icon && <Icon className="h-4 w-4 opacity-70" />}
                    </div>
                </CardHeader>
            </div>
            <CardContent className="pb-6 pt-4">
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <div className="text-2xl font-bold">
                        {config.aggregation === "sum" || config.aggregation === "avg" || config.aggregation === "min" || config.aggregation === "max"
                            ? value?.toLocaleString()
                            : value}
                    </div>
                )}
                <p className="text-xs opacity-70 mt-1 capitalize">
                    {config.aggregation}
                </p>
            </CardContent>
        </Card>
    );
}
