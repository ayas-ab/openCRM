"use client";

import { create } from "zustand";
import { validateCustomLogicExpressionInput } from "@/lib/validation/rule-logic";

export type WidgetType = "metric" | "chart" | "list";

export type FilterLogic = "ALL" | "ANY" | "CUSTOM";

export const DEFAULT_WIDGET_COLOR = "#3b82f6";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

export interface WidgetFilter {
    id: string;
    fieldDefId: number | null;
    operator: string;
    value?: string;
}

export interface WidgetConfig {
    id: string;
    type: WidgetType;
    title: string;
    colSpan: number;
    objectDefId?: number;

    // Metric
    aggregation?: "count" | "sum" | "avg" | "min" | "max";
    valueFieldDefId?: number;

    // Chart
    chartType?: "bar" | "line" | "pie" | "area";
    groupByFieldDefId?: number;

    // List
    fieldDefIds?: number[];
    systemFields?: ("createdAt" | "updatedAt")[];
    limit?: number;
    sortFieldDefId?: number;
    sortSystemField?: "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";

    // Filters
    filters?: WidgetFilter[];
    filterLogic?: FilterLogic;
    filterExpression?: string;
    ownerScope?: "any" | "mine" | "queue";
    ownerQueueId?: number;

    // Styling
    colorTheme?: string;
    icon?: string;
    color?: string;
}

export function validateWidget(widget: WidgetConfig) {
    const errors: string[] = [];
    if (!widget.objectDefId) errors.push("Object is required.");
    if (widget.type === "metric" && widget.aggregation && widget.aggregation !== "count") {
        if (!widget.valueFieldDefId) errors.push("Metric value field is required.");
    }
    if (widget.type === "chart") {
        if (!widget.groupByFieldDefId) errors.push("Chart group-by field is required.");
        if (widget.aggregation === "sum" && !widget.valueFieldDefId) {
            errors.push("Chart value field is required for sum.");
        }
    }
    if (widget.type === "list") {
        const columns = (widget.fieldDefIds || []).length + (widget.systemFields || []).length;
        if (columns === 0) errors.push("List widget needs at least one column.");
    }
    if (widget.ownerScope === "queue" && !widget.ownerQueueId) {
        errors.push("Select a queue for the Record Owner filter.");
    }
    if (!widget.color?.trim()) {
        errors.push("Accent color is required.");
    } else if (!HEX_COLOR_PATTERN.test(widget.color.trim())) {
        errors.push("Accent color must be a valid hex value.");
    }
    if (widget.filterLogic === "CUSTOM") {
        const result = validateCustomLogicExpressionInput(widget.filterExpression, (widget.filters || []).length);
        if (!result.valid) {
            errors.push(result.message);
        }
    }
    return errors;
}

interface BuilderState {
    widgets: WidgetConfig[];
    selectedWidgetId: string | null;

    setWidgets: (widgets: WidgetConfig[]) => void;
    updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
    addWidget: (type: WidgetType) => void;
    removeWidget: (id: string) => void;
    selectWidget: (id: string | null) => void;
    moveWidget: (dragIndex: number, hoverIndex: number) => void;
}

export const useBuilderStore = create<BuilderState>((set) => ({
    widgets: [],
    selectedWidgetId: null,

    setWidgets: (widgets) => set({ widgets }),

    updateWidget: (id, updates) =>
        set((state) => ({
            widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
        })),

    addWidget: (type) =>
        set((state) => {
            const base: WidgetConfig = {
                id: `temp_${Date.now()}`,
                type,
                title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
                colSpan: type === "metric" ? 3 : 6,
                filterLogic: "ALL",
                filters: [],
                colorTheme: "default",
                sortDirection: "desc",
                limit: 5,
                fieldDefIds: [],
                systemFields: [],
                ownerScope: "any",
                color: DEFAULT_WIDGET_COLOR,
            };
            return { widgets: [...state.widgets, base], selectedWidgetId: base.id };
        }),

    removeWidget: (id) =>
        set((state) => ({
            widgets: state.widgets.filter((w) => w.id !== id),
            selectedWidgetId: state.selectedWidgetId === id ? null : state.selectedWidgetId,
        })),

    selectWidget: (id) => set({ selectedWidgetId: id }),

    moveWidget: (dragIndex, hoverIndex) =>
        set((state) => {
            const newWidgets = [...state.widgets];
            const [removed] = newWidgets.splice(dragIndex, 1);
            newWidgets.splice(hoverIndex, 0, removed);
            return { widgets: newWidgets };
        }),
}));
