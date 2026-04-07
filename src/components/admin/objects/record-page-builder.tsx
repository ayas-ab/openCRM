
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    type DragEndEvent,
    type DragStartEvent,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, GripVertical, Trash2, LayoutGrid, Columns3, PanelTop, Loader2, X, HelpCircle } from "lucide-react";
import { updateRecordPageLayout } from "@/actions/admin/record-page-actions";
import type { LayoutConfigV2 } from "@/lib/record-page-layout";
import { getVisibilityExpressionValidation, normalizeRecordPageLayoutConfig } from "@/lib/record-page-layout";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";

interface FieldLike {
    id: number;
    label: string;
    apiName: string;
    type: string;
    required: boolean;
}

interface RecordPageBuilderProps {
    layoutId: number;
    layoutName: string;
    layoutConfig: LayoutConfigV2;
    fields: FieldLike[];
    permissionSets: { id: number; name: string }[];
}

type SelectedTarget =
    | { type: "section"; sectionId: string }
    | { type: "field"; sectionId: string; fieldId: number }
    | { type: "highlights" }
    | null;

type VisibilityRule = NonNullable<LayoutConfigV2["sections"][number]["visibility"]>;
type VisibilityFilter = VisibilityRule["filters"][number];

type FieldOption = {
    key: string;
    label: string;
    type: string;
    fieldId?: number;
    fieldApiName?: string;
};

const sectionFieldId = (sectionId: string, fieldId: number) => `section|${sectionId}|field|${fieldId}`;
const sectionColumnId = (sectionId: string, col: number) => `section|${sectionId}|col|${col}`;
const paletteFieldId = (fieldId: number) => `palette|${fieldId}`;
const highlightFieldId = (fieldId: number) => `highlight|${fieldId}`;
const highlightDropId = "highlight|drop";

const parseDragId = (id: string) => {
    const parts = id.split("|");
    const [prefix] = parts;
    if (prefix === "section" && parts[2] === "field") {
        return { type: "section-field" as const, sectionId: parts[1], fieldId: Number(parts[3]) };
    }
    if (prefix === "section" && parts[2] === "col") {
        return { type: "section-col" as const, sectionId: parts[1], col: Number(parts[3]) };
    }
    if (prefix === "palette") {
        return { type: "palette" as const, fieldId: Number(parts[1]) };
    }
    if (prefix === "highlight") {
        if (parts[1] === "drop") return { type: "highlight-drop" as const };
        return { type: "highlight" as const, fieldId: Number(parts[1]) };
    }
    return { type: "unknown" as const };
};

const clampColumns = (value: number | undefined) => {
    if (value === 1 || value === 2 || value === 3) return value;
    return 2;
};

const splitColumns = (
    items: LayoutConfigV2["sections"][number]["items"],
    columns: number
) => {
    const buckets = Array.from({ length: columns }, () => [] as LayoutConfigV2["sections"][number]["items"]);
    items.forEach((item) => {
        const colIndex = item.col && item.col >= 1 && item.col <= columns ? item.col - 1 : 0;
        buckets[colIndex].push(item);
    });
    return buckets;
};

const mergeColumns = (columns: LayoutConfigV2["sections"][number]["items"][]) => {
    return columns.flat();
};

const stripOwnerGroupFilters = (config: LayoutConfigV2): LayoutConfigV2 => {
    const stripVisibility = (visibility: VisibilityRule | undefined): VisibilityRule | undefined => {
        if (!visibility) return visibility;
        const filtered = visibility.filters.filter((filter) => filter.field !== "ownerGroupId");
        if (filtered.length === visibility.filters.length) return visibility;
        return {
            ...visibility,
            filters: filtered,
        };
    };

    return {
        ...config,
        sections: config.sections.map((section) => ({
            ...section,
            visibility: stripVisibility(section.visibility),
            items: section.items.map((item) => ({
                ...item,
                visibility: stripVisibility(item.visibility),
            })),
        })),
    };
};

const getOperatorLabel = (operator: string, fieldType?: string) => {
    if (fieldType === "PermissionSet") {
        return operator === "equals" ? "has permission" : "does not have";
    }
    return operator.replace("_", " ");
};

const getValueInputType = (fieldType?: string) => {
    if (fieldType === "Date") return "date";
    if (fieldType === "DateTime") return "datetime-local";
    return "text";
};

const getValueInputValue = (fieldType: string | undefined, value: string | undefined) => {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value || "";
};

function SortableFieldCard({
    id,
    label,
    type,
    required,
    onSelect,
    action,
}: {
    id: string;
    label: string;
    type: string;
    required: boolean;
    onSelect: () => void;
    action?: ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center justify-between rounded-md border border-border/40 bg-background px-3 py-2 shadow-sm group hover:border-primary/40 transition-colors ${
                isDragging ? "opacity-60" : ""
            }`}
            onClick={onSelect}
        >
            <div className="flex items-center gap-2">
                <span {...attributes} {...listeners} className="text-muted-foreground cursor-grab">
                    <GripVertical className="h-4 w-4" />
                </span>
                <div>
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{type}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {required && (
                    <Badge variant="outline" className="text-[10px]">
                        Required
                    </Badge>
                )}
                {action}
            </div>
        </div>
    );
}

function PaletteFieldCard({
    id,
    label,
    type,
    required,
    onAdd,
}: {
    id: string;
    label: string;
    type: string;
    required: boolean;
    onAdd: () => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id,
        data: { type: "palette" },
    });
    const style = isDragging ? { opacity: 0.4 } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center justify-between rounded-md border border-transparent bg-transparent px-3 py-2 hover:bg-background hover:shadow-sm hover:border-border/40 transition-all cursor-pointer group"
            onClick={onAdd}
            {...attributes}
            {...listeners}
        >
            <div>
                <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{type}</p>
            </div>
            {required ? (
                <Badge variant="outline" className="text-[10px]">
                    Required
                </Badge>
            ) : (
                <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
        </div>
    );
}

function DroppableColumn({
    id,
    isEmpty,
    children,
}: {
    id: string;
    isEmpty: boolean;
    children: ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`min-h-[120px] rounded-lg border border-dashed ${
                isOver ? "border-primary/60 bg-primary/5" : "border-border/40 bg-background"
            } p-3`}
        >
            {isEmpty ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                    Drop fields here
                </div>
            ) : (
                <div className="space-y-2">{children}</div>
            )}
        </div>
    );
}
export function RecordPageBuilder({
    layoutId,
    layoutName,
    layoutConfig,
    fields,
    permissionSets,
}: RecordPageBuilderProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [name, setName] = useState(layoutName);
    const [config, setConfig] = useState<LayoutConfigV2>(() => stripOwnerGroupFilters(layoutConfig));
    const [selected, setSelected] = useState<SelectedTarget>(null);
    const [search, setSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor)
    );

    const fieldMap = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
    const filterableFields = useMemo(
        () => fields.filter((field) => !["TextArea", "File"].includes(field.type)),
        [fields]
    );
    const permissionSetOptions = useMemo(
        () => permissionSets.map((permissionSet) => ({
            id: permissionSet.id,
            label: permissionSet.name,
        })),
        [permissionSets]
    );

    const allSectionFieldIds = useMemo(
        () => new Set(config.sections.flatMap((section) => section.items.map((item) => item.fieldId))),
        [config.sections]
    );

    const availableFields = useMemo(() => {
        const lower = search.trim().toLowerCase();
        return fields.filter((field) => {
            if (allSectionFieldIds.has(field.id)) return false;
            if (!lower) return true;
            return field.label.toLowerCase().includes(lower) || field.apiName.toLowerCase().includes(lower);
        });
    }, [fields, allSectionFieldIds, search]);

    const sectionsWithColumns = useMemo(() => {
        return config.sections.map((section) => {
            const columns = clampColumns(section.columns);
            const columnItems = splitColumns(section.items, columns);
            return { section, columns, columnItems };
        });
    }, [config.sections]);

    const fieldLocation = useMemo(() => {
        const map = new Map<number, { sectionId: string; col: number; index: number }>();
        sectionsWithColumns.forEach(({ section, columnItems }) => {
            columnItems.forEach((column, colIndex) => {
                column.forEach((item, index) => {
                    map.set(item.fieldId, { sectionId: section.id, col: colIndex + 1, index });
                });
            });
        });
        return map;
    }, [sectionsWithColumns]);

    const activeDragLabel = useMemo(() => {
        if (!activeDragId) return null;
        const parsed = parseDragId(activeDragId);
        if (parsed.type === "palette" || parsed.type === "highlight" || parsed.type === "section-field") {
            const field = fieldMap.get(parsed.fieldId);
            return field ? field.label : null;
        }
        return null;
    }, [activeDragId, fieldMap]);

    const highlightFields = config.highlights?.fields || [];
    const layoutNameValue = name.trim();
    const fieldOptions = useMemo<FieldOption[]>(() => {
        const systemOptions: FieldOption[] = [
            { key: "system:permissionSetId", label: "User", type: "PermissionSet" },
        ];
        const objectOptions: FieldOption[] = filterableFields.map((field) => ({
            key: `field:${field.id}`,
            label: field.label,
            type: field.type,
            fieldId: field.id,
            fieldApiName: field.apiName,
        }));
        return [...systemOptions, ...objectOptions];
    }, [filterableFields]);

    const fieldOptionMap = useMemo(
        () => new Map(fieldOptions.map((option) => [option.key, option])),
        [fieldOptions]
    );

    const defaultFieldKey = useMemo(
        () => fieldOptions.find((option) => option.key.startsWith("field:"))?.key || fieldOptions[0]?.key || "",
        [fieldOptions]
    );

    const getOperatorsForType = (fieldType?: string) => {
        if (fieldType === "PermissionSet") {
            return ["equals", "not_equals"];
        }
        if (fieldType === "Number" || fieldType === "Currency" || fieldType === "Date" || fieldType === "DateTime") {
            return ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_blank", "is_not_blank"];
        }
        if (fieldType === "Checkbox") {
            return ["equals", "not_equals", "is_blank", "is_not_blank"];
        }
        return ["equals", "not_equals", "contains", "not_contains", "is_blank", "is_not_blank"];
    };

    const getFieldKeyFromFilter = (filter: VisibilityFilter) => {
        if (filter.field === "permissionSetId") return "system:permissionSetId";
        if (filter.fieldDefId) return `field:${filter.fieldDefId}`;
        if (filter.field) {
            const match = fieldOptions.find((option) => option.fieldApiName === filter.field);
            return match?.key || defaultFieldKey;
        }
        return defaultFieldKey;
    };

    const buildFilterFromKey = (fieldKey: string, operator: string, value: string): VisibilityFilter => {
        if (fieldKey === "system:permissionSetId") {
            return { field: "permissionSetId", operator, value };
        }
        const fieldId = parseInt(fieldKey.replace("field:", ""), 10);
        const fieldDef = Number.isNaN(fieldId) ? null : fieldMap.get(fieldId);
        return fieldDef
            ? { fieldDefId: fieldDef.id, field: fieldDef.apiName, operator, value }
            : { field: "", operator, value };
    };

    const getVisibilityMode = (visibility?: VisibilityRule) => {
        if (!visibility) return "ALL";
        if (visibility.mode) return visibility.mode;
        if (visibility.logic === "ANY") return "ANY";
        return "ALL";
    };

    const setSectionConfig = (sectionId: string, updater: (section: LayoutConfigV2["sections"][number]) => LayoutConfigV2["sections"][number]) => {
        setConfig((prev) => ({
            ...prev,
            sections: prev.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
        }));
    };

    const addSection = () => {
        const id = `section-${crypto.randomUUID()}`;
        setConfig((prev) => ({
            ...prev,
            sections: [
                ...prev.sections,
                {
                    id,
                    title: "New Section",
                    columns: 2,
                    items: [],
                },
            ],
        }));
        setSelected({ type: "section", sectionId: id });
    };

    const removeSection = (sectionId: string) => {
        setConfig((prev) => ({
            ...prev,
            sections: prev.sections.filter((section) => section.id !== sectionId),
        }));
        if (selected?.type === "section" && selected.sectionId === sectionId) {
            setSelected(null);
        }
    };

    const updateSectionColumns = (
        sectionId: string,
        updater: (columns: LayoutConfigV2["sections"][number]["items"][]) => LayoutConfigV2["sections"][number]["items"][]
    ) => {
        setSectionConfig(sectionId, (section) => {
            const columns = clampColumns(section.columns);
            const columnItems = splitColumns(section.items, columns);
            const nextColumnItems = updater(columnItems).map((column, index) =>
                column.map((item) => ({ ...item, col: index + 1 }))
            );
            return {
                ...section,
                items: mergeColumns(nextColumnItems),
            };
        });
    };

    const addFieldToSection = (sectionId: string, fieldId: number, col: number) => {
        const field = fieldMap.get(fieldId);
        if (!field) return;

        setConfig((prev) => {
            const existingItem = prev.sections.flatMap((section) => section.items).find((item) => item.fieldId === fieldId);
            const nextSections = prev.sections.map((section) => {
                const columns = clampColumns(section.columns);
                let columnItems = splitColumns(section.items, columns);
                columnItems = columnItems.map((column) => column.filter((item) => item.fieldId !== fieldId));

                if (section.id === sectionId) {
                    const safeCol = Math.min(Math.max(col, 1), columns);
                    const targetIndex = safeCol - 1;
                    const item = existingItem || { type: "field" as const, fieldId, col: safeCol };
                    const targetColumn = columnItems[targetIndex] ?? [];
                    columnItems[targetIndex] = [...targetColumn, { ...item, col: safeCol }];
                }

                return {
                    ...section,
                    items: mergeColumns(columnItems),
                };
            });

            return { ...prev, sections: nextSections };
        });
    };

    const removeFieldFromSection = (sectionId: string, fieldId: number) => {
        updateSectionColumns(sectionId, (columns) =>
            columns.map((column) => column.filter((item) => item.fieldId !== fieldId))
        );
    };

    const addFieldToHighlights = (fieldId: number, index?: number) => {
        const fieldType = fieldMap.get(fieldId)?.type;
        if (fieldType && ["TextArea", "File"].includes(fieldType)) {
            toast.error("TextArea and File fields cannot be used in highlights.");
            return;
        }

        const current = config.highlights?.fields || [];
        if (current.length >= 4) {
            toast.error("Highlights are limited to 4 fields.");
            return;
        }

        if (current.includes(fieldId)) return;

        setConfig((prev) => {
            const nextFields = [...(prev.highlights?.fields || [])];
            if (typeof index === "number") {
                nextFields.splice(index, 0, fieldId);
            } else {
                nextFields.push(fieldId);
            }
            return {
                ...prev,
                highlights: {
                    columns: 4,
                    fields: nextFields,
                },
            };
        });
    };

    const removeFieldFromHighlights = (fieldId: number) => {
        setConfig((prev) => ({
            ...prev,
            highlights: {
                columns: 4,
                fields: (prev.highlights?.fields || []).filter((id) => id !== fieldId),
            },
        }));
    };

    const setSectionVisibility = (sectionId: string, updates: Partial<Pick<VisibilityRule, "mode" | "expression" | "filters">>) => {
        setSectionConfig(sectionId, (section) => {
            const visibility: VisibilityRule = section.visibility || { mode: "ALL", filters: [] };
            return {
                ...section,
                visibility: {
                    ...visibility,
                    mode: updates.mode ?? visibility.mode,
                    expression: updates.expression ?? visibility.expression,
                    filters: updates.filters ?? visibility.filters,
                },
            };
        });
    };

    const setFieldVisibility = (
        sectionId: string,
        fieldId: number,
        updates: Partial<Pick<VisibilityRule, "mode" | "expression" | "filters">>
    ) => {
        setSectionConfig(sectionId, (section) => ({
            ...section,
            items: section.items.map((item) => {
                if (item.type !== "field" || item.fieldId !== fieldId) return item;
                const visibility: VisibilityRule = item.visibility || { mode: "ALL", filters: [] };
                return {
                    ...item,
                    visibility: {
                        ...visibility,
                        mode: updates.mode ?? visibility.mode,
                        expression: updates.expression ?? visibility.expression,
                        filters: updates.filters ?? visibility.filters,
                    },
                };
            }),
        }));
    };

    const addSectionFilter = (sectionId: string) => {
        const option = fieldOptionMap.get(defaultFieldKey);
        const operator = getOperatorsForType(option?.type)[0] || "equals";
        const nextFilter = buildFilterFromKey(defaultFieldKey, operator, "");
        setSectionConfig(sectionId, (section) => {
            const visibility: VisibilityRule = section.visibility || { mode: "ALL", filters: [] };
            return {
                ...section,
                visibility: {
                    ...visibility,
                    filters: [...visibility.filters, nextFilter],
                },
            };
        });
    };

    const updateSectionFilter = (sectionId: string, index: number, updates: Partial<{ fieldKey: string; operator: string; value: string }>) => {
        setSectionConfig(sectionId, (section) => {
            const visibility: VisibilityRule = section.visibility || { mode: "ALL", filters: [] };
            const filters = visibility.filters.map((filter, filterIndex) => {
                if (filterIndex !== index) return filter;
                const fieldKey = updates.fieldKey ?? getFieldKeyFromFilter(filter);
                const option = fieldOptionMap.get(fieldKey);
                const operator = (updates.operator ?? filter.operator ?? getOperatorsForType(option?.type)[0]) || "equals";
                const value = updates.value ?? filter.value ?? "";
                return buildFilterFromKey(fieldKey, operator, value);
            });
            return {
                ...section,
                visibility: {
                    ...visibility,
                    filters,
                },
            };
        });
    };

    const removeSectionFilter = (sectionId: string, index: number) => {
        setSectionConfig(sectionId, (section) => {
            const visibility: VisibilityRule = section.visibility || { mode: "ALL", filters: [] };
            const filters = visibility.filters.filter((_, idx) => idx !== index);
            return {
                ...section,
                visibility: {
                    ...visibility,
                    filters,
                },
            };
        });
    };

    const addFieldFilter = (sectionId: string, fieldId: number) => {
        const option = fieldOptionMap.get(defaultFieldKey);
        const operator = getOperatorsForType(option?.type)[0] || "equals";
        const nextFilter = buildFilterFromKey(defaultFieldKey, operator, "");
        setSectionConfig(sectionId, (section) => ({
            ...section,
            items: section.items.map((item) => {
                if (item.type !== "field" || item.fieldId !== fieldId) return item;
                const visibility: VisibilityRule = item.visibility || { mode: "ALL", filters: [] };
                return {
                    ...item,
                    visibility: {
                        ...visibility,
                        filters: [...visibility.filters, nextFilter],
                    },
                };
            }),
        }));
    };

    const updateFieldFilter = (
        sectionId: string,
        fieldId: number,
        index: number,
        updates: Partial<{ fieldKey: string; operator: string; value: string }>
    ) => {
        setSectionConfig(sectionId, (section) => ({
            ...section,
            items: section.items.map((item) => {
                if (item.type !== "field" || item.fieldId !== fieldId) return item;
                const visibility: VisibilityRule = item.visibility || { mode: "ALL", filters: [] };
                const filters = visibility.filters.map((filter, filterIndex) => {
                    if (filterIndex !== index) return filter;
                    const fieldKey = updates.fieldKey ?? getFieldKeyFromFilter(filter);
                    const option = fieldOptionMap.get(fieldKey);
                    const operator = (updates.operator ?? filter.operator ?? getOperatorsForType(option?.type)[0]) || "equals";
                    const value = updates.value ?? filter.value ?? "";
                    return buildFilterFromKey(fieldKey, operator, value);
                });
                return {
                    ...item,
                    visibility: {
                        ...visibility,
                        filters,
                    },
                };
            }),
        }));
    };

    const removeFieldFilter = (sectionId: string, fieldId: number, index: number) => {
        setSectionConfig(sectionId, (section) => ({
            ...section,
            items: section.items.map((item) => {
                if (item.type !== "field" || item.fieldId !== fieldId) return item;
                const visibility: VisibilityRule = item.visibility || { mode: "ALL", filters: [] };
                const filters = visibility.filters.filter((_, idx) => idx !== index);
                return {
                    ...item,
                    visibility: {
                        ...visibility,
                        filters,
                    },
                };
            }),
        }));
    };
    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        if (!overId) {
            setActiveDragId(null);
            return;
        }

        const activeParsed = parseDragId(activeId);
        const overParsed = parseDragId(overId);

        if (activeParsed.type === "highlight" && overParsed.type === "highlight") {
            const fromIndex = highlightFields.indexOf(activeParsed.fieldId);
            const toIndex = highlightFields.indexOf(overParsed.fieldId);
            if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                setConfig((prev) => ({
                    ...prev,
                    highlights: {
                        columns: prev.highlights?.columns || 2,
                        fields: arrayMove(highlightFields, fromIndex, toIndex),
                    },
                }));
            }
            setActiveDragId(null);
            return;
        }

        if (activeParsed.type === "palette" && overParsed.type === "highlight") {
            const targetIndex = highlightFields.indexOf(overParsed.fieldId);
            addFieldToHighlights(activeParsed.fieldId, targetIndex);
            setActiveDragId(null);
            return;
        }

        if (activeParsed.type === "palette" && overParsed.type === "highlight-drop") {
            addFieldToHighlights(activeParsed.fieldId);
            setActiveDragId(null);
            return;
        }

        if (activeParsed.type === "section-field" && overParsed.type === "highlight") {
            const targetIndex = highlightFields.indexOf(overParsed.fieldId);
            addFieldToHighlights(activeParsed.fieldId, targetIndex);
            setActiveDragId(null);
            return;
        }

        if (activeParsed.type === "section-field" && overParsed.type === "highlight-drop") {
            addFieldToHighlights(activeParsed.fieldId);
            setActiveDragId(null);
            return;
        }

        if (
            (activeParsed.type === "palette" || activeParsed.type === "section-field") &&
            (overParsed.type === "section-field" || overParsed.type === "section-col")
        ) {
            const targetSectionId = overParsed.sectionId;
            const targetCol = overParsed.type === "section-col"
                ? overParsed.col
                : fieldLocation.get(overParsed.fieldId)?.col || 1;

            const fieldId = activeParsed.fieldId;
            const targetIndex =
                overParsed.type === "section-field"
                    ? fieldLocation.get(overParsed.fieldId)?.index ?? 0
                    : undefined;

            if (activeParsed.type === "section-field") {
                const source = fieldLocation.get(activeParsed.fieldId);
                if (!source) {
                    setActiveDragId(null);
                    return;
                }
                setConfig((prev) => {
                    const nextSections = prev.sections.map((section) => {
                        const columns = clampColumns(section.columns);
                        let columnItems = splitColumns(section.items, columns);
                        columnItems = columnItems.map((column) => column.filter((item) => item.fieldId !== fieldId));

                        if (section.id === targetSectionId) {
                            const insertAt = targetIndex ?? columnItems[targetCol - 1].length;
                            const existingItem = section.items.find((item) => item.fieldId === fieldId);
                            const newItem = existingItem || { type: "field" as const, fieldId, col: targetCol };
                            const targetColumn = [...columnItems[targetCol - 1]];
                            targetColumn.splice(insertAt, 0, { ...newItem, col: targetCol });
                            columnItems[targetCol - 1] = targetColumn;
                        }

                        return {
                            ...section,
                            items: mergeColumns(columnItems),
                        };
                    });

                    return { ...prev, sections: nextSections };
                });
            } else {
                addFieldToSection(targetSectionId, fieldId, targetCol);
            }
        }
        setActiveDragId(null);
    };

    const hasChanges =
        name.trim() !== layoutName.trim() ||
        JSON.stringify(config) !== JSON.stringify(layoutConfig);

    const layoutExpressionError = useMemo(() => {
        for (const section of config.sections) {
            const sectionValidation = getVisibilityExpressionValidation(section.visibility as VisibilityRule | undefined);
            if (!sectionValidation.valid) {
                return `Section "${section.title}" visibility: ${sectionValidation.message}`;
            }

            for (const item of section.items) {
                const fieldValidation = getVisibilityExpressionValidation(item.visibility as VisibilityRule | undefined);
                if (!fieldValidation.valid) {
                    const field = fieldMap.get(item.fieldId);
                    return `Field "${field?.label || item.fieldId}" visibility: ${fieldValidation.message}`;
                }
            }
        }
        return "";
    }, [config.sections, fieldMap]);

    const handleSave = () => {
        if (!config.sections.length) {
            toast.error("Add at least one section to this layout.");
            return;
        }
        if (layoutExpressionError) {
            toast.error(layoutExpressionError);
            return;
        }

        const normalized = normalizeRecordPageLayoutConfig(config, fields);

        startTransition(async () => {
            const result = await updateRecordPageLayout({
                layoutId,
                name: name.trim(),
                config: normalized,
            });

            if (result.success) {
                setConfig(normalized);
                toast.success("Record page layout updated");
            } else {
                toast.error(result.error || "Failed to save layout");
            }
        });
    };
    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Record Page Builder</h2>
                    <p className="text-sm text-muted-foreground">
                        Drag fields into sections, choose columns, and control highlights.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={() => setHelpOpen(true)}
                        className="gap-2"
                    >
                        <HelpCircle className="h-4 w-4" />
                        Help
                    </Button>
                    <Button variant="outline" onClick={() => setConfig(layoutConfig)} disabled={!hasChanges}>
                        Reset
                    </Button>
                    <Button onClick={handleSave} disabled={!hasChanges || isPending || Boolean(layoutExpressionError)}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Layout
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Layout Name
                </div>
                <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-9 w-[280px] bg-white"
                />
                {layoutExpressionError && (
                    <div className="text-xs text-destructive">{layoutExpressionError}</div>
                )}
            </div>

            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>How this builder works</DialogTitle>
                        <DialogDescription>
                            Build the structure once, then apply visibility rules to personalize sections and fields.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Add sections to create the layout grid.</li>
                            <li>Drag fields into sections or the highlights strip.</li>
                            <li>Add visibility rules to control what shows for users.</li>
                        </ol>
                        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                            Tip: Use custom formulas when you need a mix of AND/OR logic (e.g. <span className="font-mono">(1 AND 2) OR 3</span>).
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {isMounted ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveDragId(null)}
                >
                    <ResizablePanelGroup direction="horizontal" className="rounded-xl border bg-white shadow-sm min-h-[700px]">
                <ResizablePanel defaultSize={22} minSize={18} className="p-4">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Fields</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Drag fields into sections or the highlights panel.
                    </p>
                    <div className="mt-3">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search fields"
                            className="h-8 text-sm"
                        />
                    </div>
                    <ScrollArea className="mt-4 h-[600px] pr-3">
                        <div className="space-y-2">
                            {availableFields.length === 0 ? (
                                <div className="text-xs text-muted-foreground text-center py-6">
                                    All fields are placed.
                                </div>
                            ) : (
                                availableFields.map((field) => (
                                    <PaletteFieldCard
                                        key={field.id}
                                        id={paletteFieldId(field.id)}
                                        label={field.label}
                                        type={field.type}
                                        required={field.required}
                                        onAdd={() => {
                                            const targetSection = config.sections[0];
                                            if (targetSection) {
                                                addFieldToSection(targetSection.id, field.id, 1);
                                            }
                                        }}
                                    />
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={56} minSize={40} className="p-6 bg-slate-50/60">
                    <div className="space-y-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <PanelTop className="h-4 w-4 text-muted-foreground" />
                                            Highlights
                                        </CardTitle>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Fields shown under the record name. Use the X to remove.
                                        </p>
                                    </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary">{highlightFields.length}/4</Badge>
                                            <Badge variant="outline" className="gap-1">
                                                <Columns3 className="h-3.5 w-3.5" />
                                                Inline
                                            </Badge>
                                        </div>
                                </CardHeader>
                                <CardContent>
                                    <SortableContext
                                        items={highlightFields.map((fieldId) => highlightFieldId(fieldId))}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <DroppableColumn id={highlightDropId} isEmpty={highlightFields.length === 0}>
                                            {highlightFields.map((fieldId) => {
                                                const field = fieldMap.get(fieldId);
                                                if (!field) return null;
                                                return (
                                                    <SortableFieldCard
                                                        key={fieldId}
                                                        id={highlightFieldId(fieldId)}
                                                        label={field.label}
                                                        type={field.type}
                                                        required={field.required}
                                                        onSelect={() => setSelected({ type: "highlights" })}
                                                        action={
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    removeFieldFromHighlights(fieldId);
                                                                }}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        }
                                                    />
                                                );
                                            })}
                                        </DroppableColumn>
                                    </SortableContext>
                                </CardContent>
                            </Card>

                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Sections</h3>
                                <Button size="sm" onClick={addSection} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add Section
                                </Button>
                            </div>

                            {sectionsWithColumns.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-white p-10 text-center text-sm text-muted-foreground">
                                    Add a section to start building this layout.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {sectionsWithColumns.map(({ section, columns, columnItems }, index) => {
                                        const colorStyles = [
                                            "border-rose-200 bg-rose-50/70",
                                            "border-sky-200 bg-sky-50/70",
                                            "border-amber-200 bg-amber-50/70",
                                            "border-emerald-200 bg-emerald-50/70",
                                            "border-indigo-200 bg-indigo-50/70",
                                        ];
                                        const headerStyle = colorStyles[index % colorStyles.length];
                                        return (
                                        <Card key={section.id} className="border border-slate-200 shadow-sm">
                                            <CardHeader className={`flex flex-row items-center justify-between rounded-t-lg border-b ${headerStyle}`}>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                                            Section {index + 1}
                                                        </span>
                                                        {section.visibility?.filters?.length ? (
                                                            <Badge variant="secondary">Rules</Badge>
                                                        ) : null}
                                                    </div>
                                                    <CardTitle className="text-base">{section.title}</CardTitle>
                                                    <p className="text-xs text-muted-foreground">
                                                        {columns} column layout
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="icon"
                                                        variant="outline"
                                                        className="h-7 w-7"
                                                        onClick={() => setSelected({ type: "section", sectionId: section.id })}
                                                    >
                                                        <LayoutGrid className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-destructive"
                                                        onClick={() => removeSection(section.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <div
                                                    className={`grid gap-4 ${
                                                        columns === 1
                                                            ? "md:grid-cols-1"
                                                            : columns === 2
                                                                ? "md:grid-cols-2"
                                                                : "md:grid-cols-3"
                                                    }`}
                                                >
                                                    {columnItems.map((column, colIndex) => (
                                                        <SortableContext
                                                            key={`${section.id}-col-${colIndex}`}
                                                            items={column.map((item) => sectionFieldId(section.id, item.fieldId))}
                                                            strategy={verticalListSortingStrategy}
                                                        >
                                                            <DroppableColumn
                                                                id={sectionColumnId(section.id, colIndex + 1)}
                                                                isEmpty={column.length === 0}
                                                            >
                                                                {column.map((item) => {
                                                                    const field = fieldMap.get(item.fieldId);
                                                                    if (!field) return null;
                                                                    const visibilityMode = getVisibilityMode(item.visibility as VisibilityRule | undefined);
                                                                    const hasRule = Boolean(item.visibility?.filters?.length);
                                                                    const visibilityLabel = visibilityMode === "CUSTOM"
                                                                        ? "Custom"
                                                                        : visibilityMode === "ANY"
                                                                            ? "Any"
                                                                            : hasRule
                                                                                ? "All"
                                                                                : "Always";
                                                                    return (
                                                                        <SortableFieldCard
                                                                            key={item.fieldId}
                                                                            id={sectionFieldId(section.id, item.fieldId)}
                                                                            label={field.label}
                                                                            type={field.type}
                                                                            required={field.required}
                                                                            onSelect={() =>
                                                                                setSelected({
                                                                                    type: "field",
                                                                                    sectionId: section.id,
                                                                                    fieldId: item.fieldId,
                                                                                })
                                                                            }
                                                                            action={
                                                                                <Badge variant={hasRule ? "secondary" : "outline"} className="text-[10px]">
                                                                                    {visibilityLabel}
                                                                                </Badge>
                                                                            }
                                                                        />
                                                                    );
                                                                })}
                                                            </DroppableColumn>
                                                        </SortableContext>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                    })}
                                </div>
                            )}
                        </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={22} minSize={18} className="p-4">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Inspector</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Select a section or field to edit settings.
                    </p>

                    <div className="mt-4 space-y-4">
                        {selected?.type === "section" && (() => {
                            const section = config.sections.find((s) => s.id === selected.sectionId);
                            if (!section) return null;
                            const visibility: VisibilityRule = section.visibility || { mode: "ALL", filters: [] };
                            const visibilityMode = getVisibilityMode(visibility);
                            return (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Section Settings</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div>
                                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Title
                                            </label>
                                            <Input
                                                value={section.title}
                                                onChange={(event) =>
                                                    setSectionConfig(section.id, (current) => ({
                                                        ...current,
                                                        title: event.target.value,
                                                    }))
                                                }
                                                className="mt-2 h-8"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Columns
                                            </p>
                                            <div className="flex gap-2">
                                                {[1, 2, 3].map((count) => (
                                                    <Button
                                                        key={count}
                                                        size="sm"
                                                        variant={section.columns === count ? "default" : "outline"}
                                                        onClick={() =>
                                                            setSectionConfig(section.id, (current) => ({
                                                                ...current,
                                                                columns: count,
                                                            }))
                                                        }
                                                    >
                                                        {count}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                        <Separator />
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Visibility Rules
                                            </p>
                                            <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900">
                                                Matches hide this section.
                                            </div>
                                            <Select
                                                value={visibilityMode}
                                                onValueChange={(value) =>
                                                    setSectionVisibility(section.id, { mode: value as "ALL" | "ANY" | "CUSTOM" })
                                                }
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Match logic" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ALL">Match all conditions</SelectItem>
                                                    <SelectItem value="ANY">Match any condition</SelectItem>
                                                    <SelectItem value="CUSTOM">Custom formula</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {visibilityMode === "CUSTOM" && (
                                                <div className="space-y-2">
                                                    <Input
                                                        value={visibility.expression || ""}
                                                        onChange={(event) =>
                                                            setSectionVisibility(section.id, { expression: event.target.value })
                                                        }
                                                        placeholder="(1 AND 2) OR 3"
                                                        className="h-8 text-xs"
                                                    />
                                                    {!getVisibilityExpressionValidation(visibility).valid && (
                                                        <p className="text-[11px] text-destructive">
                                                            {getVisibilityExpressionValidation(visibility).message}
                                                        </p>
                                                    )}
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Use numbers to reference filters. Example: <span className="font-mono">(1 AND 2) OR 3</span>.
                                                    </p>
                                                </div>
                                            )}
                                            {visibility.filters.length === 0 ? (
                                                <div className="text-xs text-muted-foreground">
                                                    No filters yet. Section is always visible.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {visibility.filters.map((filter, index) => {
                                                        const fieldKey = getFieldKeyFromFilter(filter);
                                                        const option = fieldOptionMap.get(fieldKey);
                                                        const operatorOptions = getOperatorsForType(option?.type);
                                                        const operatorValue = filter.operator || operatorOptions[0] || "equals";
                                                        const showValue = !["is_blank", "is_not_blank"].includes(operatorValue);
                                                        const isPermissionSet = option?.type === "PermissionSet";
                                                        const permissionSetValue = filter.value || "";
                                                        const permissionSetItems = permissionSetOptions.map((permissionSet) => ({
                                                            id: String(permissionSet.id),
                                                            label: permissionSet.label,
                                                        }));
                                                        const hasUnknownPermission =
                                                            isPermissionSet &&
                                                            permissionSetValue &&
                                                            !permissionSetItems.some((item) => item.id === permissionSetValue);
                                                        if (hasUnknownPermission) {
                                                            permissionSetItems.push({
                                                                id: permissionSetValue,
                                                                label: `Permission #${permissionSetValue}`,
                                                            });
                                                        }

                                                        return (
                                                            <div key={`${section.id}-filter-${index}`} className="space-y-2 rounded-md border border-sky-200 bg-sky-50/70 p-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                                                                        Filter {index + 1}
                                                                    </span>
                                                                    <Badge variant="secondary">#{index + 1}</Badge>
                                                                </div>
                                                                <Select
                                                                    value={fieldKey}
                                                                    onValueChange={(value) => updateSectionFilter(section.id, index, { fieldKey: value })}
                                                                >
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue placeholder="Field" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {fieldOptions.map((fieldOption) => (
                                                                            <SelectItem key={fieldOption.key} value={fieldOption.key}>
                                                                                {fieldOption.label}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <Select
                                                                    value={operatorValue}
                                                                    onValueChange={(value) => updateSectionFilter(section.id, index, { operator: value })}
                                                                >
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue placeholder="Operator" />
                                                                    </SelectTrigger>
                                                                <SelectContent>
                                                                    {operatorOptions.map((operator) => (
                                                                        <SelectItem key={operator} value={operator}>
                                                                            {getOperatorLabel(operator, option?.type)}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {showValue && (
                                                                isPermissionSet ? (
                                                                    <Select
                                                                        value={permissionSetValue}
                                                                        onValueChange={(value) => updateSectionFilter(section.id, index, { value })}
                                                                    >
                                                                        <SelectTrigger className="h-8 text-xs">
                                                                            <SelectValue placeholder={permissionSetItems.length ? "Permission set" : "No permission sets"} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {permissionSetItems.map((permissionSet) => (
                                                                                <SelectItem key={permissionSet.id} value={permissionSet.id}>
                                                                                    {permissionSet.label}
                                                                                </SelectItem>
                                                                            ))}
                                                                            {!permissionSetItems.length && (
                                                                                <SelectItem value="__none__" disabled>
                                                                                    No permission sets
                                                                                </SelectItem>
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                ) : (
                                                                    <Input
                                                                        type={getValueInputType(option?.type)}
                                                                        value={getValueInputValue(option?.type, filter.value)}
                                                                        onChange={(event) => updateSectionFilter(section.id, index, { value: event.target.value })}
                                                                        placeholder="Value"
                                                                        className="h-8 text-xs"
                                                                    />
                                                                )
                                                            )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="w-full text-destructive justify-start"
                                                                    onClick={() => removeSectionFilter(section.id, index)}
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Remove filter
                                                                </Button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => addSectionFilter(section.id)}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add filter
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })()}

                        {selected?.type === "field" && (() => {
                            const field = fieldMap.get(selected.fieldId);
                            const location = fieldLocation.get(selected.fieldId);
                            if (!field || !location) return null;
                            const fieldSection = config.sections.find((section) => section.id === location.sectionId);
                            const fieldItem = fieldSection?.items.find((item) => item.type === "field" && item.fieldId === field.id);
                            const visibility: VisibilityRule = fieldItem?.visibility || { mode: "ALL", filters: [] };
                            const visibilityMode = getVisibilityMode(visibility);
                            return (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm">Field Settings</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div>
                                            <p className="text-sm font-medium">{field.label}</p>
                                            <p className="text-xs text-muted-foreground">{field.apiName}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Column
                                            </p>
                                            <div className="flex gap-2">
                                                {[1, 2, 3].map((count) => (
                                                    <Button
                                                        key={count}
                                                        size="sm"
                                                        variant={location.col === count ? "default" : "outline"}
                                                        onClick={() => addFieldToSection(location.sectionId, field.id, count)}
                                                    >
                                                        {count}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                        <Separator />
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Visibility Rules
                                            </p>
                                            <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900">
                                                Matches hide this field.
                                            </div>
                                            <Select
                                                value={visibilityMode}
                                                onValueChange={(value) =>
                                                    setFieldVisibility(location.sectionId, field.id, { mode: value as "ALL" | "ANY" | "CUSTOM" })
                                                }
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Match logic" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ALL">Match all conditions</SelectItem>
                                                    <SelectItem value="ANY">Match any condition</SelectItem>
                                                    <SelectItem value="CUSTOM">Custom formula</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {visibilityMode === "CUSTOM" && (
                                                <div className="space-y-2">
                                                    <Input
                                                        value={visibility.expression || ""}
                                                        onChange={(event) =>
                                                            setFieldVisibility(location.sectionId, field.id, { expression: event.target.value })
                                                        }
                                                        placeholder="(1 AND 2) OR 3"
                                                        className="h-8 text-xs"
                                                    />
                                                    {!getVisibilityExpressionValidation(visibility).valid && (
                                                        <p className="text-[11px] text-destructive">
                                                            {getVisibilityExpressionValidation(visibility).message}
                                                        </p>
                                                    )}
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Use numbers to reference filters. Example: <span className="font-mono">(1 AND 2) OR 3</span>.
                                                    </p>
                                                </div>
                                            )}
                                            {visibility.filters.length === 0 ? (
                                                <div className="text-xs text-muted-foreground">
                                                    No filters yet. Field is always visible.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {visibility.filters.map((filter, index) => {
                                                        const fieldKey = getFieldKeyFromFilter(filter);
                                                        const option = fieldOptionMap.get(fieldKey);
                                                        const operatorOptions = getOperatorsForType(option?.type);
                                                        const operatorValue = filter.operator || operatorOptions[0] || "equals";
                                                        const showValue = !["is_blank", "is_not_blank"].includes(operatorValue);
                                                        const isPermissionSet = option?.type === "PermissionSet";
                                                        const permissionSetValue = filter.value || "";
                                                        const permissionSetItems = permissionSetOptions.map((permissionSet) => ({
                                                            id: String(permissionSet.id),
                                                            label: permissionSet.label,
                                                        }));
                                                        const hasUnknownPermission =
                                                            isPermissionSet &&
                                                            permissionSetValue &&
                                                            !permissionSetItems.some((item) => item.id === permissionSetValue);
                                                        if (hasUnknownPermission) {
                                                            permissionSetItems.push({
                                                                id: permissionSetValue,
                                                                label: `Permission #${permissionSetValue}`,
                                                            });
                                                        }

                                                        return (
                                                            <div key={`${field.id}-filter-${index}`} className="space-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                                                                        Filter {index + 1}
                                                                    </span>
                                                                    <Badge variant="secondary">#{index + 1}</Badge>
                                                                </div>
                                                                <Select
                                                                    value={fieldKey}
                                                                    onValueChange={(value) =>
                                                                        updateFieldFilter(location.sectionId, field.id, index, { fieldKey: value })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue placeholder="Field" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {fieldOptions.map((fieldOption) => (
                                                                            <SelectItem key={fieldOption.key} value={fieldOption.key}>
                                                                                {fieldOption.label}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <Select
                                                                    value={operatorValue}
                                                                    onValueChange={(value) =>
                                                                        updateFieldFilter(location.sectionId, field.id, index, { operator: value })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue placeholder="Operator" />
                                                                    </SelectTrigger>
                                                                <SelectContent>
                                                                    {operatorOptions.map((operator) => (
                                                                        <SelectItem key={operator} value={operator}>
                                                                            {getOperatorLabel(operator, option?.type)}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {showValue && (
                                                                isPermissionSet ? (
                                                                    <Select
                                                                        value={permissionSetValue}
                                                                        onValueChange={(value) =>
                                                                            updateFieldFilter(location.sectionId, field.id, index, { value })
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="h-8 text-xs">
                                                                            <SelectValue placeholder={permissionSetItems.length ? "Permission set" : "No permission sets"} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {permissionSetItems.map((permissionSet) => (
                                                                                <SelectItem key={permissionSet.id} value={permissionSet.id}>
                                                                                    {permissionSet.label}
                                                                                </SelectItem>
                                                                            ))}
                                                                            {!permissionSetItems.length && (
                                                                                <SelectItem value="__none__" disabled>
                                                                                    No permission sets
                                                                                </SelectItem>
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                ) : (
                                                                    <Input
                                                                        type={getValueInputType(option?.type)}
                                                                        value={getValueInputValue(option?.type, filter.value)}
                                                                        onChange={(event) =>
                                                                            updateFieldFilter(location.sectionId, field.id, index, { value: event.target.value })
                                                                        }
                                                                        placeholder="Value"
                                                                        className="h-8 text-xs"
                                                                    />
                                                                )
                                                            )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="w-full text-destructive justify-start"
                                                                    onClick={() => removeFieldFilter(location.sectionId, field.id, index)}
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Remove filter
                                                                </Button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => addFieldFilter(location.sectionId, field.id)}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add filter
                                            </Button>
                                        </div>
                                        <Separator />
                                        <Button
                                            variant="ghost"
                                            className="w-full text-destructive justify-start"
                                            onClick={() => removeFieldFromSection(location.sectionId, field.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Remove from section
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })()}

                        {selected?.type === "highlights" && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Highlights</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    Drag fields into the highlights panel to surface key values.
                                </CardContent>
                            </Card>
                        )}

                        {!selected && (
                            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center text-xs text-muted-foreground">
                                Select a section or field to edit its settings.
                            </div>
                        )}
                    </div>
                </ResizablePanel>
                </ResizablePanelGroup>
                <DragOverlay>
                    {activeDragLabel ? (
                        <div className="rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium shadow-lg">
                            {activeDragLabel}
                        </div>
                    ) : null}
                    </DragOverlay>
                </DndContext>
            ) : (
                <div className="rounded-xl border bg-white shadow-sm min-h-[700px] flex items-center justify-center text-sm text-muted-foreground">
                    Loading layout builder...
                </div>
            )}
        </div>
    );
}
