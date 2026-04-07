"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getChartData } from "@/actions/standard/dashboard-actions";
import { cn } from "@/lib/utils";
import {
    BarChart, Bar,
    LineChart, Line,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { WIDGET_THEMES, CHART_COLORS } from "@/lib/ui-themes";
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";

interface ChartWidgetProps {
    title: string;
    config: {
        objectDefId: number;
        chartType?: "bar" | "pie" | "line" | "area";
        type?: "bar" | "pie" | "line" | "area";
        groupByFieldDefId?: number;
        aggregation?: string;
        valueFieldDefId?: number;
        filters?: any[];
        filterLogic?: string;
        filterExpression?: string;
        ownerScope?: "any" | "mine" | "queue";
        ownerQueueId?: number | null;
        colorTheme?: string;
        color?: string; // Fallback
        icon?: string;
    };
}

export function ChartWidget({ title, config }: ChartWidgetProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Normalize config
    const chartType = config.chartType || config.type || "bar";
    const themeKey = config.colorTheme || "default";
    const themeClasses = WIDGET_THEMES[themeKey] || WIDGET_THEMES["default"];
    const chartColors = (CHART_COLORS as any)[themeKey] || CHART_COLORS["default"];

    const Icon = config.icon && (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        ? (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        : null;

    useEffect(() => {
        async function fetchData() {
            if (!config.objectDefId) return;
            try {
                const result = await getChartData(config.objectDefId, config);
                setData(result);
            } catch (error) {
                console.error("Failed to fetch chart data", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [
        config.objectDefId,
        config.groupByFieldDefId,
        config.aggregation,
        config.valueFieldDefId,
        JSON.stringify(config.filters),
        config.filterLogic,
        config.filterExpression,
        config.ownerScope,
        config.ownerQueueId,
    ]);

    const renderChart = () => {
        if (chartType === "pie") {
            const pieData = data.map((entry, index) => ({
                ...entry,
                fill: chartColors[index % chartColors.length],
            }));
            return (
                <PieChart>
                    <Pie
                        data={pieData}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                    >
                        {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value, _name, props) => [
                            Array.isArray(value) ? value.join(", ") : (value ?? 0),
                            props?.payload?.name || "Count",
                        ]}
                    />
                    <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ fontSize: "12px" }}
                    />
                </PieChart>
            );
        }

        const CommonAxis = (
            <>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.5} vertical={false} />
                <XAxis
                    dataKey="name"
                    stroke="currentColor"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                />
                <YAxis
                    stroke="currentColor"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                    className="text-muted-foreground"
                />
                <Tooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
            </>
        );

        if (chartType === "line") {
            return (
                <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    {CommonAxis}
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke={chartColors[0]}
                        strokeWidth={3}
                        dot={{ r: 4, fill: chartColors[0] }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            );
        }

        if (chartType === "area") {
            return (
                <AreaChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    {CommonAxis}
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={chartColors[0]}
                        fill={chartColors[0]}
                        fillOpacity={0.3}
                    />
                </AreaChart>
            );
        }

        // Default to Bar
        return (
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                {CommonAxis}
                <Bar
                    dataKey="value"
                    fill={chartColors[0]}
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                />
            </BarChart>
        );
    };

    return (
        <Card
            className={cn("col-span-1 md:col-span-2 py-0 shadow-sm transition-all hover:shadow-md", themeClasses)}
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
                <CardHeader className="border-b border-border/10 px-6 pb-4 pt-6">
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            {config.color && (
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: config.color }}
                                />
                            )}
                            {title}
                        </CardTitle>
                        {Icon && <Icon className="h-4 w-4 opacity-70" />}
                    </div>
                </CardHeader>
            </div>
            <CardContent className="h-[350px] p-6">
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin opacity-50" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex justify-center items-center h-full opacity-50 bg-black/5 rounded-md">
                        No data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        {renderChart()}
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
