"use client";
import { WIDGET_THEMES } from "@/lib/ui-themes";
import { useEffect, useState } from "react";
import { getListWidgetData } from "@/actions/standard/dashboard-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { type LucideIcon } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface ListWidgetProps {
    title: string;
    appApiName: string;
    config: {
        objectDefId: number;
        limit?: number;
        sortDirection?: string;
        fieldDefIds?: number[];
        sortFieldDefId?: number;
        systemFields?: ("createdAt" | "updatedAt")[];
        sortSystemField?: "createdAt" | "updatedAt";
        ownerScope?: "any" | "mine" | "queue";
        ownerQueueId?: number | null;
        colorTheme?: string;
        color?: string;
        icon?: string;
        filters?: any[];
        filterLogic?: string;
        filterExpression?: string;
    };
}

export function ListWidget({ title, appApiName, config }: ListWidgetProps) {
    const [records, setRecords] = useState<any[]>([]);
    const [columns, setColumns] = useState<{ key: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [objectApiName, setObjectApiName] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            if (!config.objectDefId) return;
            try {
                const result = await getListWidgetData(config.objectDefId, config);
                setRecords(result.rows || []);
                setColumns(result.columns || []);
                setObjectApiName(result.objectApiName || null);
            } catch (error) {
                console.error("Failed to fetch list", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [
        config.objectDefId,
        config.limit,
        config.sortDirection,
        JSON.stringify(config.fieldDefIds),
        JSON.stringify(config.systemFields),
        config.sortSystemField,
        JSON.stringify(config.filters),
        config.filterLogic,
        config.filterExpression,
        config.ownerScope,
        config.ownerQueueId,
    ]);

    const themeClasses = WIDGET_THEMES[config.colorTheme || "default"] || WIDGET_THEMES["default"];
    const Icon = config.icon && (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        ? (LucideIcons as unknown as Record<string, LucideIcon>)[config.icon]
        : null;

    return (
        <Card
            className={cn("col-span-1 md:col-span-2 lg:col-span-1 py-0 shadow-sm transition-all hover:shadow-md", themeClasses)}
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
                <CardHeader className="border-b border-border/50 px-6 pb-4 pt-6">
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                        {config.color && (
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: config.color }}
                            />
                        )}
                        {Icon && <Icon className="h-4 w-4 opacity-70" />}
                        {title}
                    </CardTitle>
                </CardHeader>
            </div>
            <CardContent className="p-0 pb-6">
                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : records.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground bg-muted/20">
                        No records found
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-b border-border/50">
                                <TableHead className="pl-6 h-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                                {columns.map((col) => (
                                    <TableHead key={col.key} className="h-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {col.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {records.map((record) => (
                                <TableRow key={record.id} className="hover:bg-muted/40 border-b border-border/40 last:border-0">
                                    <TableCell className="pl-6 font-medium py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                {record.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            {objectApiName ? (
                                                <Link
                                                    href={`/app/${appApiName}/${objectApiName}/${record.id}`}
                                                    className="hover:text-primary transition-colors text-sm"
                                                >
                                                    {record.name}
                                                </Link>
                                            ) : (
                                                <span className="text-sm">{record.name}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    {columns.map((col) => (
                                        <TableCell key={col.key} className="py-3 text-sm text-muted-foreground">
                                            {record.values?.[col.key] && typeof record.values[col.key] === "object" && record.values[col.key]?.type === "lookup" ? (
                                                record.values[col.key].targetObjectApiName ? (
                                                    <Link
                                                        href={`/app/${appApiName}/${record.values[col.key].targetObjectApiName}/${record.values[col.key].id}`}
                                                        className="text-primary font-medium underline underline-offset-4 decoration-primary/50 hover:decoration-primary cursor-pointer transition-colors"
                                                    >
                                                        {record.values[col.key].name}
                                                    </Link>
                                                ) : (
                                                    <span>{record.values[col.key].name}</span>
                                                )
                                            ) : (
                                                record.values?.[col.key] ?? ""
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
