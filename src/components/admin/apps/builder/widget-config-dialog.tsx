"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WIDGET_COLOR, useBuilderStore, WidgetConfig, WidgetFilter } from "./builder-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { IconPicker } from "../../objects/icon-picker";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";
import { validateWidget } from "./builder-store";

interface WidgetConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableObjects: any[];
    availableQueues: { id: number; name: string }[];
}

const BASE_OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does Not Contain" },
    { value: "gt", label: "Greater Than" },
    { value: "gte", label: "Greater Or Equal" },
    { value: "lt", label: "Less Than" },
    { value: "lte", label: "Less Or Equal" },
    { value: "is_blank", label: "Is Blank" },
    { value: "is_not_blank", label: "Is Not Blank" },
];

function getOperatorOptions(fieldType?: string) {
    if (!fieldType) return BASE_OPERATORS;
    if (fieldType === "Lookup") {
        return BASE_OPERATORS.filter((op) => ["is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Picklist") {
        return BASE_OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Checkbox") {
        return BASE_OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Number" || fieldType === "Date" || fieldType === "DateTime") {
        return BASE_OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    return BASE_OPERATORS.filter((op) => !["gt", "gte", "lt", "lte"].includes(op.value));
}

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function getValueInputType(fieldType?: string) {
    if (fieldType === "Date") return "date";
    if (fieldType === "DateTime") return "datetime-local";
    return "text";
}

function getValueInputValue(fieldType: string | undefined, value: string | undefined) {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value || "";
}

export function WidgetConfigDialog({ open: _open, onOpenChange: _onOpenChange, availableObjects, availableQueues }: WidgetConfigDialogProps) {
    const { widgets, selectedWidgetId, updateWidget } = useBuilderStore();
    const widget = widgets.find((w) => w.id === selectedWidgetId);
    const [objectFields, setObjectFields] = useState<any[]>([]);
    const [loadingFields, setLoadingFields] = useState(false);
    const [localColor, setLocalColor] = useState("");
    const colorCommitRef = useRef<string | null>(null);

    useEffect(() => {
        if (!widget?.objectDefId) {
            setObjectFields([]);
            return;
        }

        const selectedObj = availableObjects.find((o) => o.id === widget.objectDefId);
        if (!selectedObj?.apiName) {
            setObjectFields([]);
            return;
        }

        const fetchFields = async () => {
            setLoadingFields(true);
            try {
                const response = await fetch(`/api/fields/${selectedObj.apiName}`);
                if (response.ok) {
                    const data = await response.json();
                    setObjectFields(data.fields || []);
                }
            } catch (error) {
                console.error("Failed to fetch fields:", error);
            } finally {
                setLoadingFields(false);
            }
        };

        fetchFields();
    }, [widget?.objectDefId, availableObjects]);

    const filterableFields = useMemo(
        () => objectFields.filter((field) => !["TextArea", "File"].includes(field.type)),
        [objectFields]
    );
    const fieldMap = new Map(filterableFields.map((f) => [f.id, f]));
    const listFields = filterableFields.filter((field) => !["TextArea", "File"].includes(field.type));
    const systemFieldOptions = [
        { id: "createdAt", label: "Created Date" },
        { id: "updatedAt", label: "Last Modified Date" },
    ] as const;

    
    useEffect(() => {
        if (!widget) return;
        const next = widget.color || DEFAULT_WIDGET_COLOR;
        setLocalColor(next);
        colorCommitRef.current = next;
        if (!widget.color) {
            updateWidget(widget.id, { color: DEFAULT_WIDGET_COLOR });
        }
    }, [widget?.id, widget?.color, updateWidget]);
    if (!widget) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Select a widget to configure its data, filters, and styling.
            </div>
        );
    }

    const handleChange = (key: keyof WidgetConfig, value: any) => {
        updateWidget(widget.id, { [key]: value });
    };

    const commitColor = (value: string) => {
        const trimmed = value.trim();
        const normalized = HEX_COLOR_PATTERN.test(trimmed) ? trimmed : DEFAULT_WIDGET_COLOR;
        setLocalColor(normalized);
        if (colorCommitRef.current === normalized) return;
        colorCommitRef.current = normalized;
        updateWidget(widget.id, { color: normalized });
    };

    const handleObjectChange = (objectDefId: number) => {
        updateWidget(widget.id, {
            objectDefId,
            valueFieldDefId: undefined,
            groupByFieldDefId: undefined,
            fieldDefIds: [],
            systemFields: [],
            sortFieldDefId: undefined,
            sortSystemField: undefined,
            filters: [],
            ownerScope: "any",
            ownerQueueId: undefined,
        });
    };

    const addFilter = () => {
        const filters = widget.filters || [];
        const newFilter: WidgetFilter = {
            id: generateId(),
            fieldDefId: null,
            operator: "equals",
            value: "",
        };
        handleChange("filters", [...filters, newFilter]);
    };

    const updateFilter = (filterId: string, updates: Partial<WidgetFilter>) => {
        const filters = widget.filters || [];
        handleChange(
            "filters",
            filters.map((f) => (f.id === filterId ? { ...f, ...updates } : f))
        );
    };

    const removeFilter = (filterId: string) => {
        const filters = widget.filters || [];
        handleChange("filters", filters.filter((f) => f.id !== filterId));
    };

    const validationErrors = validateWidget(widget);
    const customLogicError = validationErrors.find((error) => error.toLowerCase().includes("expression"));

    return (
        <div className="p-6">
            <div className="mb-6">
                <h3 className="text-lg font-semibold capitalize">{widget.type} Widget Configuration</h3>
                <p className="text-sm text-muted-foreground">
                    Configure data sources, filters, and styling.
                </p>
                {validationErrors.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {validationErrors[0]}
                    </div>
                )}
            </div>

            <Tabs defaultValue="general">
                    <TabsList className="grid w-full grid-cols-4 bg-slate-100 p-1">
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="data">Data</TabsTrigger>
                        <TabsTrigger value="filters">Filters</TabsTrigger>
                        <TabsTrigger value="styling">Styling</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" className="space-y-4 mt-4">
                        <div className="rounded-lg border bg-slate-50 p-4 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Widget Title</Label>
                                <Input
                                    value={widget.title}
                                    onChange={(e) => handleChange("title", e.target.value)}
                                    placeholder="Enter widget title..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Width (Grid Columns)</Label>
                                <Select
                                    value={widget.colSpan.toString()}
                                    onValueChange={(val) => handleChange("colSpan", parseInt(val))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="3">Small (1/4)</SelectItem>
                                        <SelectItem value="4">Medium (1/3)</SelectItem>
                                        <SelectItem value="6">Half (1/2)</SelectItem>
                                        <SelectItem value="8">Large (2/3)</SelectItem>
                                        <SelectItem value="12">Full Width</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="data" className="space-y-4 mt-4">
                        <div className="rounded-lg border bg-slate-50 p-4 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Data Object</Label>
                                <Select
                                    value={widget.objectDefId?.toString() || ""}
                                    onValueChange={(val) => handleObjectChange(parseInt(val))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Object..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableObjects.map((obj) => (
                                            <SelectItem key={obj.id} value={obj.id.toString()}>
                                                {obj.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {widget.type === "metric" && (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Aggregation</Label>
                                        <Select
                                            value={widget.aggregation || "count"}
                                            onValueChange={(val) => handleChange("aggregation", val)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="count">Count Records</SelectItem>
                                                <SelectItem value="sum">Sum</SelectItem>
                                                <SelectItem value="avg">Average</SelectItem>
                                                <SelectItem value="min">Min</SelectItem>
                                                <SelectItem value="max">Max</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {widget.aggregation && widget.aggregation !== "count" && (
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Number Field</Label>
                                            <Select
                                                value={widget.valueFieldDefId?.toString() || ""}
                                                onValueChange={(val) =>
                                                    handleChange("valueFieldDefId", parseInt(val))
                                                }
                                                disabled={loadingFields}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={loadingFields ? "Loading..." : "Select Field..."} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {objectFields
                                                        .filter((f) => f.type === "Number")
                                                        .map((field) => (
                                                            <SelectItem key={field.id} value={field.id.toString()}>
                                                                {field.label}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </>
                            )}

                            {widget.type === "chart" && (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Chart Type</Label>
                                        <Select
                                            value={widget.chartType || "bar"}
                                            onValueChange={(val) => handleChange("chartType", val)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bar">Bar</SelectItem>
                                                <SelectItem value="line">Line</SelectItem>
                                                <SelectItem value="pie">Pie</SelectItem>
                                                <SelectItem value="area">Area</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Group By (Picklist)</Label>
                                        <Select
                                            value={widget.groupByFieldDefId?.toString() || ""}
                                            onValueChange={(val) =>
                                                handleChange("groupByFieldDefId", parseInt(val))
                                            }
                                            disabled={loadingFields}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={loadingFields ? "Loading..." : "Select Picklist..."} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {objectFields
                                                    .filter((f) => f.type === "Picklist")
                                                    .map((field) => (
                                                        <SelectItem key={field.id} value={field.id.toString()}>
                                                            {field.label}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Aggregation</Label>
                                        <Select
                                            value={widget.aggregation || "count"}
                                            onValueChange={(val) => handleChange("aggregation", val)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="count">Count</SelectItem>
                                                <SelectItem value="sum">Sum</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {widget.aggregation === "sum" && (
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Number Field</Label>
                                            <Select
                                                value={widget.valueFieldDefId?.toString() || ""}
                                                onValueChange={(val) =>
                                                    handleChange("valueFieldDefId", parseInt(val))
                                                }
                                                disabled={loadingFields}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={loadingFields ? "Loading..." : "Select Field..."} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {objectFields
                                                        .filter((f) => f.type === "Number")
                                                        .map((field) => (
                                                            <SelectItem key={field.id} value={field.id.toString()}>
                                                                {field.label}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </>
                            )}

                            {widget.type === "list" && (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Display Limit</Label>
                                        <Select
                                            value={(widget.limit || 5).toString()}
                                            onValueChange={(val) => handleChange("limit", parseInt(val))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="3">3 records</SelectItem>
                                                <SelectItem value="5">5 records</SelectItem>
                                                <SelectItem value="10">10 records</SelectItem>
                                                <SelectItem value="20">20 records</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">List Columns</Label>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            {listFields.map((field) => {
                                                const selected = (widget.fieldDefIds || []).includes(field.id);
                                                return (
                                                    <label
                                                        key={field.id}
                                                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => {
                                                                const next = new Set(widget.fieldDefIds || []);
                                                                if (selected) next.delete(field.id);
                                                                else next.add(field.id);
                                                                handleChange("fieldDefIds", Array.from(next));
                                                            }}
                                                        />
                                                        <span>{field.label}</span>
                                                    </label>
                                                );
                                            })}
                                            {systemFieldOptions.map((field) => {
                                                const selected = (widget.systemFields || []).includes(field.id);
                                                return (
                                                    <label
                                                        key={field.id}
                                                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => {
                                                                const next = new Set(widget.systemFields || []);
                                                                if (selected) next.delete(field.id);
                                                                else next.add(field.id);
                                                                handleChange("systemFields", Array.from(next));
                                                            }}
                                                        />
                                                        <span>{field.label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Sort Field</Label>
                                        <Select
                                            value={
                                                widget.sortSystemField
                                                    ? `system:${widget.sortSystemField}`
                                                    : widget.sortFieldDefId?.toString() || ""
                                            }
                                            onValueChange={(val) => {
                                                if (!val) {
                                                    handleChange("sortFieldDefId", undefined);
                                                    handleChange("sortSystemField", undefined);
                                                    return;
                                                }
                                                if (val.startsWith("system:")) {
                                                    const systemField = val.replace("system:", "") as "createdAt" | "updatedAt";
                                                    handleChange("sortSystemField", systemField);
                                                    handleChange("sortFieldDefId", undefined);
                                                    return;
                                                }
                                                handleChange("sortFieldDefId", parseInt(val));
                                                handleChange("sortSystemField", undefined);
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Field..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {listFields.map((field) => (
                                                    <SelectItem key={field.id} value={field.id.toString()}>
                                                        {field.label}
                                                    </SelectItem>
                                                ))}
                                                {systemFieldOptions.map((field) => (
                                                    <SelectItem key={field.id} value={`system:${field.id}`}>
                                                        {field.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Sort Direction</Label>
                                        <Select
                                            value={widget.sortDirection || "desc"}
                                            onValueChange={(val) => handleChange("sortDirection", val)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="asc">Ascending</SelectItem>
                                                <SelectItem value="desc">Descending</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="filters" className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Filter Conditions</h3>
                                <p className="text-sm text-muted-foreground">
                                    Limit which records are included in this widget
                                </p>
                            </div>
                            <Button onClick={addFilter} size="sm" variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Filter
                            </Button>
                        </div>

                        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                            <div>
                                <Label className="text-sm font-semibold">Record Owner</Label>
                                <p className="text-xs text-muted-foreground">
                                    Limit results to records owned by you or a specific queue.
                                </p>
                            </div>
                            <Select
                                value={widget.ownerScope || "any"}
                                onValueChange={(val) => {
                                    handleChange("ownerScope", val);
                                    if (val !== "queue") {
                                        handleChange("ownerQueueId", undefined);
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select owner filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">All records</SelectItem>
                                    <SelectItem value="mine">My records</SelectItem>
                                    <SelectItem value="queue">Specific queue</SelectItem>
                                </SelectContent>
                            </Select>
                            {widget.ownerScope === "queue" && (
                                <Select
                                    value={widget.ownerQueueId?.toString() || ""}
                                    onValueChange={(val) => handleChange("ownerQueueId", parseInt(val))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={availableQueues.length ? "Select queue" : "No queues available"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableQueues.map((queue) => (
                                            <SelectItem key={queue.id} value={queue.id.toString()}>
                                                {queue.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {!widget.filters || widget.filters.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-lg">
                                No filters configured.
                            </div>
                        ) : (
                            widget.filters.map((filter, index) => {
                                const field = filter.fieldDefId ? fieldMap.get(filter.fieldDefId) : null;
                                const operators = getOperatorOptions(field?.type);
                                const needsValue = !["is_blank", "is_not_blank"].includes(filter.operator);

                                return (
                                    <div key={filter.id} className="border rounded-lg p-4 space-y-3 bg-white">
                                        <div className="flex items-center justify-between">
                                            <Badge variant="secondary">Condition {index + 1}</Badge>
                                            <Button
                                                onClick={() => removeFilter(filter.id)}
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold">Field</Label>
                                                <Select
                                                    value={filter.fieldDefId?.toString() || ""}
                                                    onValueChange={(val) =>
                                                        updateFilter(filter.id, {
                                                            fieldDefId: parseInt(val),
                                                            operator: "equals",
                                                            value: "",
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {filterableFields.map((f) => (
                                                            <SelectItem key={f.id} value={f.id.toString()}>
                                                                {f.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold">Operator</Label>
                                                <Select
                                                    value={filter.operator}
                                                    onValueChange={(val) => updateFilter(filter.id, { operator: val })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {operators.map((op) => (
                                                            <SelectItem key={op.value} value={op.value}>
                                                                {op.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {needsValue && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-semibold">Value</Label>
                                                    {field?.type === "Picklist" ? (
                                                        <Select
                                                            value={filter.value || ""}
                                                            onValueChange={(val) => updateFilter(filter.id, { value: val })}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {(field.picklistOptions || [])
                                                                    .filter((opt: any) => opt.isActive !== false)
                                                                    .map((opt: any) => (
                                                                        <SelectItem key={opt.id} value={String(opt.id)}>
                                                                            {opt.label}
                                                                        </SelectItem>
                                                                    ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : field?.type === "Checkbox" ? (
                                                        <Select
                                                            value={filter.value || ""}
                                                            onValueChange={(val) => updateFilter(filter.id, { value: val })}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="true">True</SelectItem>
                                                                <SelectItem value="false">False</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <Input
                                                            type={getValueInputType(field?.type)}
                                                            value={getValueInputValue(field?.type, filter.value)}
                                                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                                                            placeholder="Enter value..."
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div className="rounded-lg border p-4 space-y-3 bg-slate-50">
                            <Label className="text-sm font-semibold">Filter Logic</Label>
                            <Select
                                value={widget.filterLogic || "ALL"}
                                onValueChange={(val: any) => handleChange("filterLogic", val)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">AND (all conditions must match)</SelectItem>
                                    <SelectItem value="ANY">OR (any condition matches)</SelectItem>
                                    <SelectItem value="CUSTOM">Custom Expression</SelectItem>
                                </SelectContent>
                            </Select>

                            {widget.filterLogic === "CUSTOM" && (
                                <div className="space-y-2">
                                    <Input
                                        value={widget.filterExpression || ""}
                                        onChange={(e) => handleChange("filterExpression", e.target.value)}
                                        placeholder="(1 AND 2) OR 3"
                                        className="font-mono"
                                    />
                                    {customLogicError && (
                                        <p className="text-xs text-destructive">
                                            {customLogicError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="styling" className="space-y-6 mt-4">
                        <div className="space-y-3">
                            <Label>Widget Icon</Label>
                            <div className="border rounded-lg p-4 bg-slate-50">
                                <IconPicker
                                    value={widget.icon}
                                    onChange={(icon) => handleChange("icon", icon)}
                                />
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label className="block">Accent Color</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={HEX_COLOR_PATTERN.test(localColor) ? localColor : DEFAULT_WIDGET_COLOR}
                                    onChange={(e) => setLocalColor(e.target.value)}
                                    className="h-10 w-12 rounded border"
                                    onPointerUp={() => commitColor(localColor)}
                                    onKeyUp={() => commitColor(localColor)}
                                    onBlur={() => commitColor(localColor)}
                                />
                                <Input
                                    value={localColor || DEFAULT_WIDGET_COLOR}
                                    onChange={(e) => setLocalColor(e.target.value)}
                                    placeholder="#3B82F6"
                                    onBlur={() => commitColor(localColor)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Accent color is required. Empty or invalid values reset to the default blue.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>
        </div>
    );
}
