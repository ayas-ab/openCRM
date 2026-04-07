"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowDown, ArrowUp, Info, ListFilter, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createListView, updateListView } from "@/actions/standard/list-view-actions";
import { cn } from "@/lib/utils";
import { validateCustomLogicExpressionInput } from "@/lib/validation/rule-logic";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";

type FieldOption = {
    id: number;
    apiName: string;
    label: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string; isActive: boolean }>;
};

type ListViewShare = {
    principalType: "GROUP" | "PERMISSION_SET";
    principalId: number;
};

type ListViewColumn = {
    fieldDefId: number;
};

type ListViewCriteria = {
    logic: "ALL" | "ANY" | "CUSTOM";
    expression?: string;
    ownerScope?: "any" | "mine" | "queue";
    ownerQueueId?: number | null;
    filters: Array<{
        fieldDefId?: number;
        field?: string;
        operator?: string;
        value?: string;
    }>;
};

type ListViewData = {
    id: number;
    name: string;
    description?: string | null;
    isGlobal: boolean;
    criteria?: ListViewCriteria | null;
    columns?: ListViewColumn[];
    shares?: ListViewShare[];
    sortField?: string | null;
    sortDirection?: "asc" | "desc";
    viewMode?: "table" | "kanban";
    kanbanGroupByFieldDefId?: number | null;
};

type ListViewEditorDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "create" | "edit";
    objectDefId: number;
    fields: FieldOption[];
    groups: Array<{ id: number; name: string }>;
    permissionSets: Array<{ id: number; name: string }>;
    queues: Array<{ id: number; name: string }>;
    initial?: ListViewData | null;
    onCreated?: (id: number, name: string) => void;
    panel?: "filters" | "settings";
    forcedViewMode?: "table" | "kanban" | null;
};
const OPERATOR_OPTIONS = {
    Text: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "contains", label: "Contains" },
        { value: "not_contains", label: "Not contains" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    Number: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "gt", label: "Greater than" },
        { value: "gte", label: "Greater or equal" },
        { value: "lt", label: "Less than" },
        { value: "lte", label: "Less or equal" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    Date: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "gt", label: "After" },
        { value: "gte", label: "On or after" },
        { value: "lt", label: "Before" },
        { value: "lte", label: "On or before" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    DateTime: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "gt", label: "After" },
        { value: "gte", label: "On or after" },
        { value: "lt", label: "Before" },
        { value: "lte", label: "On or before" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    Checkbox: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    Lookup: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
    Picklist: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "is_blank", label: "Is blank" },
        { value: "is_not_blank", label: "Is not blank" },
    ],
};

const DEFAULT_OPERATORS = OPERATOR_OPTIONS.Text;

const operatorRequiresValue = (operator: string) => !["is_blank", "is_not_blank"].includes(operator);

function getOperatorsForType(type?: string) {
    if (!type) return DEFAULT_OPERATORS;
    return OPERATOR_OPTIONS[type as keyof typeof OPERATOR_OPTIONS] ?? DEFAULT_OPERATORS;
}

function getDefaultOperator(type?: string) {
    return getOperatorsForType(type)[0]?.value ?? "equals";
}

function toReadableExpression(expression?: string) {
    if (!expression) return "";
    return expression
        .replace(/\s*&&\s*/g, " AND ")
        .replace(/\s*\|\|\s*/g, " OR ")
        .replace(/!\s*/g, "NOT ")
        .replace(/\s+/g, " ")
        .trim();
}

function getFilterInputValue(fieldType: string | undefined, value: string | undefined) {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value ?? "";
}

export function ListViewEditorDialog({
    open,
    onOpenChange,
    mode,
    objectDefId,
    fields,
    groups,
    permissionSets,
    queues,
    initial,
    onCreated,
    panel,
    forcedViewMode = null,
}: ListViewEditorDialogProps) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isGlobal, setIsGlobal] = useState(true);
    const [logic, setLogic] = useState<"ALL" | "ANY" | "CUSTOM">("ALL");
    const [expression, setExpression] = useState("");
    const [ownerScope, setOwnerScope] = useState<"any" | "mine" | "queue">("any");
    const [ownerQueueId, setOwnerQueueId] = useState<number | null>(null);
    const [filters, setFilters] = useState<ListViewCriteria["filters"]>([]);
    const [columnOrder, setColumnOrder] = useState<number[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
    const [selectedPermissionSets, setSelectedPermissionSets] = useState<number[]>([]);
    const [sortField, setSortField] = useState<string>("");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
    const [kanbanGroupByFieldDefId, setKanbanGroupByFieldDefId] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const listViewFields = useMemo(
        () => fields.filter((field) => !["TextArea", "File"].includes(field.type)),
        [fields]
    );

    const defaultColumnIds = useMemo(() => {
        const nameField = listViewFields.find((field) => field.apiName === "name");
        if (nameField) return [nameField.id];
        return listViewFields[0]?.id ? [listViewFields[0].id] : [];
    }, [listViewFields]);

    const kanbanFields = useMemo(
        () => listViewFields.filter((field) => field.type === "Picklist"),
        [listViewFields]
    );

    const isCreate = mode === "create";
    const showFilters = !isCreate && (panel === "filters" || !panel);
    const showSettings = !isCreate && (panel === "settings" || !panel);

    useEffect(() => {
        if (!open) return;
        const seedColumns =
            initial?.columns?.map((column) => column.fieldDefId) ?? defaultColumnIds;
        const initialCriteria = initial?.criteria ?? { logic: "ALL", filters: [] };
        const groupIds = (initial?.shares || [])
            .filter((share) => share.principalType === "GROUP")
            .map((share) => share.principalId);
        const permissionIds = (initial?.shares || [])
            .filter((share) => share.principalType === "PERMISSION_SET")
            .map((share) => share.principalId);

        setName(initial?.name ?? "");
        setDescription(initial?.description ?? "");
        setIsGlobal(initial ? initial.isGlobal : true);
        setLogic(initialCriteria.logic === "CUSTOM" ? "CUSTOM" : initialCriteria.logic === "ANY" ? "ANY" : "ALL");
        setExpression(toReadableExpression(initialCriteria.expression ?? ""));
        setOwnerScope(
            initialCriteria.ownerScope === "mine" || initialCriteria.ownerScope === "queue"
                ? initialCriteria.ownerScope
                : "any"
        );
        setOwnerQueueId(initialCriteria.ownerQueueId ?? null);
        setFilters(initialCriteria.filters ?? []);
        setColumnOrder(seedColumns);
        setSelectedGroups(groupIds);
        setSelectedPermissionSets(permissionIds);
        setSortField(initial?.sortField ?? "");
        setSortDirection(initial?.sortDirection === "desc" ? "desc" : "asc");
        setViewMode(initial?.viewMode === "kanban" ? "kanban" : "table");
        setKanbanGroupByFieldDefId(initial?.kanbanGroupByFieldDefId ?? null);
        if (forcedViewMode) {
            setViewMode(forcedViewMode);
        }
    }, [open, initial, defaultColumnIds, forcedViewMode]);
    const orderedColumns = useMemo(() => {
        const fieldIds = new Set(listViewFields.map((field) => field.id));
        return columnOrder.filter((id) => fieldIds.has(id));
    }, [listViewFields, columnOrder]);

    const customLogicValidation = useMemo(() => {
        if (isCreate || logic !== "CUSTOM") return { valid: true, message: "" };
        const result = validateCustomLogicExpressionInput(expression, filters.length);
        if (!result.valid) {
            if (result.message === "Expression references a condition number that does not exist.") {
                return { valid: false, message: `Use condition numbers between 1 and ${filters.length}.` };
            }
            return { valid: false, message: result.message };
        }
        return { valid: true, message: "" };
    }, [isCreate, logic, expression, filters.length]);

    const handleToggleColumn = (fieldId: number) => {
        setColumnOrder((current) =>
            current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]
        );
    };

    const handleMoveColumn = (index: number, direction: "up" | "down") => {
        setColumnOrder((current) => {
            const next = [...current];
            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= next.length) return current;
            const temp = next[index];
            next[index] = next[targetIndex];
            next[targetIndex] = temp;
            return next;
        });
    };

    const handleToggleGroup = (groupId: number) => {
        setSelectedGroups((current) =>
            current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
        );
    };

    const handleTogglePermission = (permissionId: number) => {
        setSelectedPermissionSets((current) =>
            current.includes(permissionId) ? current.filter((id) => id !== permissionId) : [...current, permissionId]
        );
    };

    const handleFilterChange = (index: number, updates: Partial<NonNullable<ListViewCriteria["filters"]>[number]>) => {
        setFilters((current) => {
            const next = [...(current ?? [])];
            const existing = next[index] ?? {};
            const field = updates.fieldDefId ?? existing.fieldDefId;
            const fieldType = listViewFields.find((f) => f.id === field)?.type;
            const operator = updates.operator ?? existing.operator ?? getDefaultOperator(fieldType);
            const value = updates.value ?? existing.value ?? "";
            next[index] = {
                ...existing,
                fieldDefId: field,
                operator,
                value,
            };
            return next;
        });
    };

    const addFilter = () => {
        const firstField = listViewFields[0];
        setFilters((current) => [
            ...(current ?? []),
            {
                fieldDefId: firstField?.id,
                operator: getDefaultOperator(firstField?.type),
                value: "",
            },
        ]);
    };

    const removeFilter = (index: number) => {
        setFilters((current) => (current ?? []).filter((_, idx) => idx !== index));
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error("Name is required.");
            return;
        }

        const columnIds = orderedColumns.length > 0 ? orderedColumns : defaultColumnIds;
        if (!columnIds.length) {
            toast.error("Pick at least one column.");
            return;
        }

        if (!isCreate && logic === "CUSTOM" && !customLogicValidation.valid) {
            toast.error(customLogicValidation.message || "Fix the custom logic expression.");
            return;
        }
        if (!isCreate && ownerScope === "queue" && !ownerQueueId) {
            toast.error("Select a queue for the Record Owner filter.");
            return;
        }
        if (!isCreate && viewMode === "kanban" && !kanbanGroupByFieldDefId) {
            toast.error("Choose a picklist field to group the Kanban view.");
            return;
        }

        setIsSaving(true);
        try {
            const criteria: ListViewCriteria & { logic: "ALL" | "ANY" | "CUSTOM" } = isCreate
                ? { logic: "ALL", filters: [], ownerScope: "any", ownerQueueId: null }
                : {
                    logic,
                    filters: filters ?? [],
                    expression: expression.trim() || undefined,
                    ownerScope,
                    ownerQueueId: ownerScope === "queue" ? ownerQueueId : null,
                };

            const payload = {
                objectDefId,
                name: name.trim(),
                description: description.trim() || undefined,
                isGlobal: isCreate ? true : isGlobal,
                shareGroupIds: isCreate ? [] : selectedGroups,
                sharePermissionSetIds: isCreate ? [] : selectedPermissionSets,
                criteria,
                columns: columnIds.map((fieldDefId) => ({ fieldDefId })),
                sortField: isCreate ? undefined : sortField || undefined,
                sortDirection: sortDirection,
                viewMode: isCreate ? "table" : viewMode,
                kanbanGroupByFieldDefId: isCreate ? null : kanbanGroupByFieldDefId ?? null,
            };

            const result =
                mode === "create"
                    ? await createListView(payload)
                    : await updateListView({
                        ...payload,
                        listViewId: initial?.id ?? 0,
                    });

            if (!result.success) {
                toast.error(result.error || "Failed to save list view.");
                return;
            }

            if (mode === "create" && result.data?.id) {
                onCreated?.(result.data.id, payload.name);
            }

            toast.success(mode === "create" ? "List view created." : "List view updated.");
            onOpenChange(false);
            if (mode === "edit" || !onCreated) {
                router.refresh();
            }
        } catch (error) {
            toast.error("Failed to save list view.");
        } finally {
            setIsSaving(false);
        }
    };
    const contentClassName = cn(
        "w-[95vw] overflow-hidden p-0 flex flex-col min-h-0 rounded-2xl shadow-xl",
        isCreate ? "max-w-2xl h-[80vh]" : "max-w-6xl h-[90vh]"
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={contentClassName}>
                <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4">
                    <DialogTitle>{mode === "create" ? "Create list view" : "Edit list view"}</DialogTitle>
                    <DialogDescription>
                        {isCreate
                            ? "Name your list view. You can configure filters, columns, and sharing after it is created."
                            : panel === "filters"
                                ? "Adjust the filters and logic for this list view."
                                : "Manage visibility, columns, and sorting for this list view."}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0 bg-slate-50/40">
                    <div className="space-y-6 px-6 pb-6 pr-4">
                        {(isCreate || showSettings) && (
                            <div className="rounded-lg border bg-slate-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <Info className="h-4 w-4 text-slate-500" />
                            Basics
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                            <div className="space-y-2">
                                <Label htmlFor="view-name">View name</Label>
                                <Input
                                    id="view-name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="e.g. My Open Deals"
                                />
                            </div>
                            {!isCreate && (
                                <div className="space-y-2">
                                    <Label htmlFor="view-description">Description</Label>
                                    <Input
                                        id="view-description"
                                        value={description}
                                        onChange={(event) => setDescription(event.target.value)}
                                        placeholder="Optional notes"
                                    />
                                </div>
                            )}
                        </div>
                            </div>
                        )}

                        {!isCreate && (showFilters || showSettings) && (
                            <div className={cn("grid gap-6", showFilters && showSettings ? "lg:grid-cols-[1.3fr_0.9fr]" : "lg:grid-cols-1")}>
                                <div className="space-y-6">
                                    {showSettings && (
                                <div className="rounded-lg border bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                        Visibility
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        <RadioGroup
                                            value={isGlobal ? "all" : "restricted"}
                                            onValueChange={(value) => setIsGlobal(value === "all")}
                                            className="grid gap-3"
                                        >
                                            <div className="flex items-center gap-3 rounded-lg border bg-slate-50/60 p-3">
                                                <RadioGroupItem value="all" id="view-global" />
                                                <Label htmlFor="view-global">Everyone with access</Label>
                                            </div>
                                            <div className="flex items-center gap-3 rounded-lg border bg-slate-50/60 p-3">
                                                <RadioGroupItem value="restricted" id="view-restricted" />
                                                <Label htmlFor="view-restricted">Only specific groups or permissions</Label>
                                            </div>
                                        </RadioGroup>
                                        {!isGlobal && (
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="rounded-lg border bg-slate-50/60 p-3 space-y-2">
                                                    <p className="text-sm font-medium text-foreground">Groups</p>
                                                    <ScrollArea className="h-28">
                                                        <div className="space-y-2 pr-2">
                                                            {groups.length === 0 && (
                                                                <p className="text-xs text-muted-foreground">No groups available.</p>
                                                            )}
                                                            {groups.map((group) => (
                                                                <label key={group.id} className="flex items-center gap-2 text-sm">
                                                                    <Checkbox
                                                                        checked={selectedGroups.includes(group.id)}
                                                                        onCheckedChange={() => handleToggleGroup(group.id)}
                                                                    />
                                                                    {group.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                </div>
                                                <div className="rounded-lg border bg-slate-50/60 p-3 space-y-2">
                                                    <p className="text-sm font-medium text-foreground">Permission sets</p>
                                                    <ScrollArea className="h-28">
                                                        <div className="space-y-2 pr-2">
                                                            {permissionSets.length === 0 && (
                                                                <p className="text-xs text-muted-foreground">No permission sets available.</p>
                                                            )}
                                                            {permissionSets.map((permission) => (
                                                                <label key={permission.id} className="flex items-center gap-2 text-sm">
                                                                    <Checkbox
                                                                        checked={selectedPermissionSets.includes(permission.id)}
                                                                        onCheckedChange={() => handleTogglePermission(permission.id)}
                                                                    />
                                                                    {permission.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                    )}

                                    {showFilters && (
                                <div className="rounded-lg border bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                                <ListFilter className="h-4 w-4 text-slate-500" />
                                                Filters
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Use condition numbers in custom logic, like 1 AND (2 OR 3).
                                            </p>
                                        </div>
                                        <Select value={logic} onValueChange={(value) => setLogic(value === "CUSTOM" ? "CUSTOM" : value === "ANY" ? "ANY" : "ALL")}>
                                            <SelectTrigger className="w-[150px]">
                                                <SelectValue placeholder="Logic" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">Match all</SelectItem>
                                                <SelectItem value="ANY">Match any</SelectItem>
                                                <SelectItem value="CUSTOM">Custom</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {logic === "CUSTOM" && (
                                        <div className="mt-3 rounded-md border bg-slate-50/60 p-3">
                                            <Label htmlFor="custom-expression" className="text-xs uppercase tracking-wide text-muted-foreground">Custom logic</Label>
                                            <Input
                                                id="custom-expression"
                                                value={expression}
                                                onChange={(event) => setExpression(event.target.value)}
                                                placeholder="1 AND (2 OR 3)"
                                                className="mt-2"
                                            />
                                            {!customLogicValidation.valid && (
                                                <p className="mt-2 text-xs text-destructive">{customLogicValidation.message}</p>
                                            )}
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Use AND, OR, NOT,with condition numbers.
                                            </p>
                                        </div>
                                    )}

                                    <div className="mt-3 rounded-md border bg-slate-50/60 p-3">
                                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Record Owner</Label>
                                        <Select
                                            value={ownerScope}
                                            onValueChange={(value) => {
                                                const nextScope = value === "mine" || value === "queue" ? value : "any";
                                                setOwnerScope(nextScope);
                                                if (nextScope !== "queue") {
                                                    setOwnerQueueId(null);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="mt-2">
                                                <SelectValue placeholder="Select owner filter" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="any">All records</SelectItem>
                                                <SelectItem value="mine">My records</SelectItem>
                                                <SelectItem value="queue">Specific queue</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {ownerScope === "queue" && (
                                            <Select
                                                value={ownerQueueId ? String(ownerQueueId) : ""}
                                                onValueChange={(value) => setOwnerQueueId(Number(value))}
                                            >
                                                <SelectTrigger className="mt-2">
                                                    <SelectValue placeholder={queues.length ? "Select queue" : "No queues available"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {queues.map((queue) => (
                                                        <SelectItem key={queue.id} value={String(queue.id)}>
                                                            {queue.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {(filters ?? []).map((filter, index) => {
                                            const field = listViewFields.find((f) => f.id === filter.fieldDefId);
                                            const operators = getOperatorsForType(field?.type);
                                            const selectedOperator = filter.operator || getDefaultOperator(field?.type);
                                            const showValue = operatorRequiresValue(selectedOperator);

                                            return (
                                                <div key={`filter-${index}`} className="grid gap-2 rounded-lg border bg-slate-50/60 p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="text-xs">{index + 1}</Badge>
                                                        <span className="text-xs text-muted-foreground">Condition</span>
                                                    </div>
                                                    <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto] items-center">
                                                        <Select
                                                            value={filter.fieldDefId ? String(filter.fieldDefId) : ""}
                                                            onValueChange={(value) => handleFilterChange(index, { fieldDefId: Number(value) })}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Field" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {listViewFields.map((fieldOption) => (
                                                                    <SelectItem key={fieldOption.id} value={String(fieldOption.id)}>
                                                                        {fieldOption.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>

                                                        <Select
                                                            value={selectedOperator}
                                                            onValueChange={(value) => handleFilterChange(index, { operator: value })}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Operator" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {operators.map((operator) => (
                                                                    <SelectItem key={operator.value} value={operator.value}>
                                                                        {operator.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>

                                                        {showValue ? (
                                                            field?.type === "Picklist" ? (
                                                                <Select
                                                                    value={filter.value ?? ""}
                                                                    onValueChange={(val) => handleFilterChange(index, { value: val })}
                                                                >
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select option" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {(field.picklistOptions || [])
                                                                            .filter((opt) => opt.isActive !== false)
                                                                            .map((opt) => (
                                                                                <SelectItem key={opt.id} value={String(opt.id)}>
                                                                                    {opt.label}
                                                                                </SelectItem>
                                                                            ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <Input
                                                                    value={getFilterInputValue(field?.type, filter.value)}
                                                                    onChange={(event) => handleFilterChange(index, { value: event.target.value })}
                                                                    placeholder="Value"
                                                                    type={
                                                                        field?.type === "Number"
                                                                            ? "number"
                                                                            : field?.type === "Date"
                                                                                ? "date"
                                                                                : field?.type === "DateTime"
                                                                                    ? "datetime-local"
                                                                                    : "text"
                                                                    }
                                                                />
                                                            )
                                                        ) : (
                                                            <div className="text-xs text-muted-foreground">No value</div>
                                                        )}

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => removeFilter(index)}
                                                            className="text-muted-foreground hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <Button variant="outline" size="sm" onClick={addFilter} className="gap-2">
                                            <Plus className="h-4 w-4" />
                                            Add filter
                                        </Button>
                                    </div>
                                </div>
                                    )}
                            </div>

                            {showSettings && (
                                <div className="space-y-6">
                                <div className="rounded-lg border bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                        View Mode
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Choose how this list view should render.
                                    </p>
                                    <div className="mt-3 space-y-3">
                                        <ToggleGroup
                                            type="single"
                                            value={viewMode}
                                            onValueChange={(value) => setViewMode((value as "table" | "kanban") || "table")}
                                            variant="outline"
                                            size="sm"
                                        >
                                            <ToggleGroupItem value="table">List</ToggleGroupItem>
                                            <ToggleGroupItem value="kanban" disabled={kanbanFields.length === 0}>
                                                Kanban
                                            </ToggleGroupItem>
                                        </ToggleGroup>

                                        {viewMode === "kanban" && (
                                            <div className="space-y-2">
                                                <Label className="text-xs">Group by picklist</Label>
                                                <Select
                                                    value={kanbanGroupByFieldDefId ? String(kanbanGroupByFieldDefId) : ""}
                                                    onValueChange={(value) => {
                                                        if (value === "__none") return;
                                                        const parsed = Number(value);
                                                        setKanbanGroupByFieldDefId(Number.isNaN(parsed) ? null : parsed);
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select picklist field" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {kanbanFields.length === 0 && (
                                                            <SelectItem value="__none" disabled>
                                                                No picklist fields available
                                                            </SelectItem>
                                                        )}
                                                        {kanbanFields.map((field) => (
                                                            <SelectItem key={field.id} value={String(field.id)}>
                                                                {field.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    Kanban requires a picklist field for grouping.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                        Columns
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Order controls how columns appear left to right.
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        {orderedColumns.length === 0 && (
                                            <p className="text-xs text-muted-foreground">Select columns to show in this view.</p>
                                        )}
                                        {orderedColumns.map((fieldId, index) => {
                                            const field = listViewFields.find((item) => item.id === fieldId);
                                            return (
                                                <div key={`${fieldId}-${index}`} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50/60 px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                                                        <span className="text-sm font-medium text-foreground">{field?.label ?? "Unknown"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleMoveColumn(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleMoveColumn(index, "down")}
                                                            disabled={index === orderedColumns.length - 1}
                                                        >
                                                            <ArrowDown className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <Separator className="my-4" />
                                    <ScrollArea className="h-56">
                                        <div className="space-y-2 pr-2">
                                            {listViewFields.map((field) => (
                                                <label key={field.id} className="flex items-center justify-between gap-2 text-sm rounded-md border px-3 py-2">
                                                    <span>{field.label}</span>
                                                    <Checkbox
                                                        checked={orderedColumns.includes(field.id)}
                                                        onCheckedChange={() => handleToggleColumn(field.id)}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>

                                <div className="rounded-lg border bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                        Sort
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Choose how records are ordered when the view loads.
                                    </p>
                                    <div className="mt-3 space-y-3">
                                        <Select value={sortField} onValueChange={setSortField}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Sort field" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="createdAt">Created date</SelectItem>
                                                <SelectItem value="updatedAt">Last updated</SelectItem>
                                                <SelectItem value="name">Name</SelectItem>
                                                {listViewFields.map((field) => (
                                                    <SelectItem key={field.id} value={field.apiName}>
                                                        {field.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Select value={sortDirection} onValueChange={(value) => setSortDirection(value === "asc" ? "asc" : "desc")}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Sort direction" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="asc">Ascending</SelectItem>
                                                <SelectItem value="desc">Descending</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                </div>
                            )}
                        </div>
                    )}
                    </div>
                </ScrollArea>

                <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-slate-50 px-6 py-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? "Saving..." : mode === "create" ? "Create view" : "Save changes"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
