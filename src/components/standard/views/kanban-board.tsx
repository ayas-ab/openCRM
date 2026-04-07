"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatDateOnlyForDisplay, formatDateTimeForDisplay } from "@/lib/temporal";

type KanbanBoardProps = {
    records: any[];
    objectDef: any;
    appApiName: string;
    groupByField: any;
    cardFields: any[];
    lookupResolutions: Record<string, Record<string, { id: number; name: string; targetObjectApiName: string }>>;
};

type KanbanColumn = {
    key: string;
    label: string;
    isInactive?: boolean;
    records: any[];
};

export function KanbanBoard({
    records,
    objectDef,
    appApiName,
    groupByField,
    cardFields,
    lookupResolutions,
}: KanbanBoardProps) {
    const groupByKey = groupByField.apiName;
    const options = Array.isArray(groupByField.picklistOptions) ? groupByField.picklistOptions : [];
    const optionMap = new Map(options.map((opt: any) => [String(opt.id), opt]));

    const grouped = new Map<string, any[]>();
    records.forEach((record) => {
        const rawValue = record[groupByKey];
        const key = rawValue === null || rawValue === undefined || rawValue === "" ? "__empty" : String(rawValue);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)?.push(record);
    });

    const columns: KanbanColumn[] = options.map((opt: any) => ({
        key: String(opt.id),
        label: `${opt.label}${opt.isActive === false ? " (inactive)" : ""}`,
        isInactive: opt.isActive === false,
        records: grouped.get(String(opt.id)) ?? [],
    }));

    if (grouped.has("__empty")) {
        columns.push({
            key: "__empty",
            label: "No value",
            records: grouped.get("__empty") ?? [],
        });
    }

    const unknownKeys = Array.from(grouped.keys()).filter(
        (key) => key !== "__empty" && !optionMap.has(key)
    );
    if (unknownKeys.length) {
        const unknownRecords = unknownKeys.flatMap((key) => grouped.get(key) ?? []);
        columns.push({
            key: "__unknown",
            label: "Unknown",
            records: unknownRecords,
        });
    }

    return (
        <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((column) => (
                <div key={column.key} className="w-72 shrink-0">
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                            <div className={cn("text-sm font-semibold text-slate-800", column.isInactive && "text-slate-500")}>
                                {column.label}
                            </div>
                            <Badge variant="secondary">{column.records.length}</Badge>
                        </div>
                        <div className="space-y-3 p-3">
                            {column.records.length === 0 && (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                                    No records
                                </div>
                            )}
                            {column.records.map((record) => (
                                <Card key={record.id} className="border-slate-200 shadow-sm">
                                    <CardContent className="p-3 space-y-2">
                                        <Link
                                            href={`/app/${appApiName}/${objectDef.apiName}/${record.id}`}
                                            className="text-sm font-semibold text-primary hover:underline"
                                        >
                                            {record.name || `Record #${record.id}`}
                                        </Link>
                                        <div className="space-y-1">
                                            {cardFields
                                                .filter((field) => field.apiName !== groupByKey)
                                                .slice(0, 3)
                                                .map((field) => (
                                                    <div key={field.id} className="text-xs text-slate-600">
                                                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                                            {field.label}
                                                        </span>
                                                        <div className="text-xs text-slate-700">
                                                            {renderFieldValue(field, record[field.apiName], lookupResolutions, appApiName)}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                        <div className="pt-1 text-[11px] text-slate-400">
                                            Updated {format(new Date(record.updatedAt), "MMM d, yyyy")}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function renderFieldValue(
    fieldDef: any,
    value: any,
    lookupResolutions: Record<string, Record<string, { id: number; name: string; targetObjectApiName: string }>>,
    appApiName: string
) {
    if (value === null || value === undefined || value === "") return "-";

    switch (fieldDef.type) {
        case "Lookup": {
            const resolution = lookupResolutions[fieldDef.apiName]?.[String(value)];
            if (resolution) {
                return (
                    <Link
                        href={`/app/${appApiName}/${resolution.targetObjectApiName}/${resolution.id}`}
                        className="text-primary hover:underline font-medium"
                    >
                        {resolution.name}
                    </Link>
                );
            }
            return value;
        }
        case "Picklist": {
            const options = Array.isArray(fieldDef.picklistOptions) ? fieldDef.picklistOptions : [];
            const match = options.find((opt: any) => String(opt.id) === String(value));
            if (!match) return value;
            return `${match.label}${match.isActive === false ? " (inactive)" : ""}`;
        }
        case "Date":
            return formatDateOnlyForDisplay(value) ?? value;
        case "DateTime":
            return formatDateTimeForDisplay(value) ?? value;
        default:
            return value;
    }
}
