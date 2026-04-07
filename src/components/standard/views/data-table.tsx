"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Pin,
    Plus,
    Settings,
    Star,
    Trash2,
    Filter,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    deleteListView,
    setUserDefaultListView,
    toggleListViewPin,
} from "@/actions/standard/list-view-actions";
import { ListViewEditorDialog } from "@/components/standard/views/list-view-editor-dialog";
import { KanbanBoard } from "@/components/standard/views/kanban-board";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateOnlyForDisplay, formatDateTimeForDisplay } from "@/lib/temporal";

interface DataTableProps {
    data: any[];
    objectDef: any;
    appApiName: string;
    canCreate?: boolean;
    canEdit?: boolean;
    canDataLoad?: boolean;
    lookupResolutions?: Record<
        string,
        Record<string, { id: number; name: string; targetObjectApiName: string }>
    >;
    listViews: Array<{
        id: number;
        name: string;
        isDefault: boolean;
        isGlobal: boolean;
    }>;
    activeListViewId: number | null;
    activeListView?: any | null;
    pinnedListViewIds?: number[];
    canModifyListViews?: boolean;
    userDefaultListViewId?: number | null;
    groups?: Array<{ id: number; name: string }>;
    permissionSets?: Array<{ id: number; name: string }>;
    queues?: Array<{ id: number; name: string }>;
    isAdmin?: boolean;
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        sortField?: string;
        sortDirection: "asc" | "desc";
    };
}

export function DataTable({
    data,
    objectDef,
    appApiName,
    canCreate = true,
    canEdit = true,
    canDataLoad = false,
    lookupResolutions = {},
    listViews,
    activeListViewId,
    activeListView,
    pinnedListViewIds = [],
    canModifyListViews = false,
    userDefaultListViewId = null,
    groups = [],
    permissionSets = [],
    queues = [],
    isAdmin = false,
    pagination,
}: DataTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const listViewFields = useMemo(
        () => objectDef.fields.filter((field: any) => !["TextArea", "File"].includes(field.type)),
        [objectDef.fields]
    );

    const columns = useMemo(() => {
        const allowedFieldIds = new Set(listViewFields.map((field: any) => field.id));
        const listViewColumns =
            activeListView?.columns
                ?.map((column: any) =>
                    column.fieldDef || listViewFields.find((field: any) => field.id === column.fieldDefId)
                )
                .filter((field: any) => field && allowedFieldIds.has(field.id)) || [];
        if (listViewColumns.length > 0) return listViewColumns;
        return listViewFields.slice(0, 5);
    }, [activeListView, listViewFields]);

    const [localListViews, setLocalListViews] = useState(listViews);
    const [localActiveListViewId, setLocalActiveListViewId] = useState(activeListViewId);

    useEffect(() => {
        setLocalListViews(listViews);
    }, [listViews]);

    useEffect(() => {
        setLocalActiveListViewId(activeListViewId);
    }, [activeListViewId]);

    const pinnedViews = useMemo(() => {
        const pinned = new Set(pinnedListViewIds);
        return localListViews.filter((view) => pinned.has(view.id));
    }, [localListViews, pinnedListViewIds]);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [editorPanel, setEditorPanel] = useState<"settings" | "filters">("settings");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const isDefaultView = Boolean(activeListView?.isDefault);
    const isUserDefault = Boolean(localActiveListViewId && userDefaultListViewId === localActiveListViewId);
    const activeViewMode = activeListView?.viewMode === "kanban" ? "kanban" : "table";
    const kanbanGroupByField = listViewFields.find(
        (field: any) => field.id === activeListView?.kanbanGroupByFieldDefId
    );
    const canRunImport = canDataLoad && (canCreate || canEdit);

    const updateQuery = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });
        return params.toString();
    };

    const handleViewChange = (value: string) => {
        setLocalActiveListViewId(Number(value));
        const query = updateQuery({
            view: value,
            page: "1",
            sortField: null,
            sortDirection: null,
        });
        router.push(`${pathname}?${query}`);
    };

    const handleSetDefault = async () => {
        if (!localActiveListViewId) return;
        const result = await setUserDefaultListView(localActiveListViewId, objectDef.id);
        if (!result.success) {
            toast.error(result.error || "Failed to set default view.");
            return;
        }
        toast.success("Default view updated.");
        router.refresh();
    };

    const handleTogglePin = async () => {
        if (!localActiveListViewId) return;
        const result = await toggleListViewPin(localActiveListViewId, objectDef.id);
        if (!result.success) {
            toast.error(result.error || "Failed to update pin.");
            return;
        }
        router.refresh();
    };

    const handleDeleteView = async () => {
        if (!localActiveListViewId) return;
        const result = await deleteListView(localActiveListViewId, objectDef.id);
        if (!result.success) {
            toast.error(result.error || "Failed to delete view.");
            return;
        }
        toast.success("List view deleted.");
        setDeleteOpen(false);
        router.refresh();
    };

    const openEditor = (mode: "create" | "edit", panel: "settings" | "filters" = "settings") => {
        setEditorMode(mode);
        setEditorPanel(panel);
        setEditorOpen(true);
    };


    const handleCreated = (id: number, name: string) => {
        setLocalListViews((current) => {
            if (current.some((view) => view.id === id)) return current;
            return [...current, { id, name, isDefault: false, isGlobal: true }];
        });
        setLocalActiveListViewId(id);
        const query = updateQuery({
            view: String(id),
            page: "1",
            sortField: null,
            sortDirection: null,
        });
        router.push(`${pathname}?${query}`);
    };

    const handleSort = (fieldApiName: string) => {
        const isActive = pagination.sortField === fieldApiName;
        const nextDirection =
            isActive && pagination.sortDirection === "asc" ? "desc" : "asc";
        const query = updateQuery({
            sortField: fieldApiName,
            sortDirection: nextDirection,
            page: "1",
        });
        router.push(`${pathname}?${query}`);
    };

    const handlePageChange = (page: number) => {
        const nextPage = Math.max(1, Math.min(page, pagination.totalPages));
        const query = updateQuery({ page: nextPage.toString() });
        router.push(`${pathname}?${query}`);
    };

    const renderSortIcon = (fieldApiName: string) => {
        if (pagination.sortField !== fieldApiName) {
            return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
        }

        return pagination.sortDirection === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
        ) : (
            <ArrowDown className="h-3.5 w-3.5" />
        );
    };

    const firstRowIndex =
        data.length === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
    const lastRowIndex = (pagination.page - 1) * pagination.pageSize + data.length;

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-white shadow-sm">
                <div className="px-6 py-4 border-b border-border/50">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {objectDef.label}
                            </div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {objectDef.pluralLabel}
                            </h1>
                            {localActiveListViewId && (
                                <div className="mt-1 text-sm text-muted-foreground">
                                    View:{" "}
                                    <span className="font-medium text-foreground">
                                        {localListViews.find((view) => view.id === localActiveListViewId)?.name ?? "All"}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {canCreate && (
                                <Button asChild className="shadow-sm">
                                    <Link href={`/app/${appApiName}/${objectDef.apiName}/new`}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        New {objectDef.label}
                                    </Link>
                                </Button>
                            )}
                            {canRunImport && (
                                <Button asChild variant="outline">
                                    <Link href={`/app/${appApiName}/${objectDef.apiName}/import`}>
                                        Bulk Insert / Update
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={localActiveListViewId ? String(localActiveListViewId) : ""}
                                onValueChange={handleViewChange}
                            >
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="Select view" />
                                </SelectTrigger>
                                <SelectContent>
                                    {localListViews.map((view) => (
                                        <SelectItem key={view.id} value={String(view.id)}>
                                            <div className="flex items-center gap-2">
                                                <span>{view.name}</span>
                                                {view.isDefault && (
                                                    <Badge variant="outline" className="text-[10px]">Default</Badge>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                        <Button
                            variant={isUserDefault ? "secondary" : "outline"}
                            size="sm"
                            onClick={handleSetDefault}
                                disabled={!localActiveListViewId}
                            >
                                <Star className="mr-2 h-4 w-4" />
                                {isUserDefault ? "Default view" : "Set default"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleTogglePin} disabled={!localActiveListViewId}>
                                <Pin className="mr-2 h-4 w-4" />
                                {localActiveListViewId && pinnedListViewIds.includes(localActiveListViewId) ? "Unpin" : "Pin"}
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {canModifyListViews && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => openEditor("edit", "filters")}
                                        disabled={!localActiveListViewId}
                                        aria-label="Edit list view filters"
                                    >
                                        <Filter className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => openEditor("edit", "settings")}
                                        disabled={!localActiveListViewId}
                                        aria-label="Edit list view settings"
                                    >
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => openEditor("create")}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        New view
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeleteOpen(true)}
                                        disabled={!localActiveListViewId || isDefaultView}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {pinnedViews.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {pinnedViews.map((view) => (
                                <Button
                                    key={view.id}
                                    variant={view.id === activeListViewId ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleViewChange(String(view.id))}
                                    className="h-8"
                                >
                                    <Star className="mr-2 h-3.5 w-3.5" />
                                    {view.name}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {activeViewMode === "kanban" ? (
                <div className="rounded-xl border border-border/60 bg-white shadow-sm p-4">
                    {kanbanGroupByField ? (
                        <KanbanBoard
                            records={data}
                            objectDef={objectDef}
                            appApiName={appApiName}
                            groupByField={kanbanGroupByField}
                            cardFields={columns}
                            lookupResolutions={lookupResolutions}
                        />
                    ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                            Kanban requires a picklist field to group records.
                            {canModifyListViews && (
                                <div className="mt-4">
                                    <Button variant="outline" size="sm" onClick={() => openEditor("edit", "settings")}>
                                        Configure Kanban
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-b border-border/60">
                                {columns.map((field: any) => (
                                    <TableHead key={field.id} className="h-11">
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => handleSort(field.apiName)}
                                        >
                                            <span>{field.label}</span>
                                            {renderSortIcon(field.apiName)}
                                        </button>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((record) => (
                                <TableRow key={record.id} className="hover:bg-muted/40 border-b border-border/40 last:border-0 transition-colors">
                                    {columns.map((field: any) => (
                                        <TableCell key={field.id} className="py-3 text-sm">
                                            {field.apiName === "name" ? (
                                                <Link
                                                    href={`/app/${appApiName}/${objectDef.apiName}/${record.id}`}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    {record[field.apiName] || "Untitled"}
                                                </Link>
                                            ) : (
                                                formatValue(record[field.apiName], field, appApiName, lookupResolutions)
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                            {data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="text-center py-12 text-muted-foreground bg-muted/5"
                                    >
                                        No records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-2">
                <div className="text-xs font-medium text-muted-foreground">
                    Showing {firstRowIndex}-{lastRowIndex} of {pagination.total} records
                </div>
                {pagination.totalPages > 1 && (
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        handlePageChange(pagination.page - 1);
                                    }}
                                    className={cn("h-8 w-8 p-0", pagination.page === 1 ? "pointer-events-none opacity-50" : "")}
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <div className="text-sm font-medium mx-2 min-w-[3rem] text-center">
                                    {pagination.page} / {pagination.totalPages}
                                </div>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        handlePageChange(pagination.page + 1);
                                    }}
                                    className={cn("h-8 w-8 p-0", pagination.page === pagination.totalPages ? "pointer-events-none opacity-50" : "")}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </div>

            {canModifyListViews && (
                <ListViewEditorDialog
                    open={editorOpen}
                    onOpenChange={setEditorOpen}
                    mode={editorMode}
                    objectDefId={objectDef.id}
                    fields={listViewFields}
                    groups={groups}
                    permissionSets={permissionSets}
                    queues={queues}
                    initial={editorMode === "edit" ? activeListView : null}
                    panel={editorMode === "edit" ? editorPanel : undefined}
                    onCreated={handleCreated}
                />
            )}

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete list view?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the view for everyone who can access it. The default view cannot be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteView} className="bg-destructive text-destructive-foreground">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function formatValue(
    value: any,
    fieldDef: any,
    appApiName: string,
    lookupResolutions: Record<
        string,
        Record<string, { id: number; name: string; targetObjectApiName: string }>
    >
) {
    if (value === null || value === undefined) return "-";

    switch (fieldDef.type) {
        case "Date":
            return (
                <span suppressHydrationWarning>
                    {formatDateOnlyForDisplay(value) ?? String(value)}
                </span>
            );
        case "DateTime":
            return (
                <span suppressHydrationWarning>
                    {formatDateTimeForDisplay(value) ?? String(value)}
                </span>
            );
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
        case "Checkbox":
            return (
                <Checkbox
                    checked={value === true || value === "true"}
                    disabled
                    className="translate-y-[2px]"
                />
            );
        case "Picklist": {
            const options = Array.isArray(fieldDef.picklistOptions) ? fieldDef.picklistOptions : [];
            const match = options.find((opt: any) => String(opt.id) === String(value));
            if (!match) return value;
            return `${match.label}${match.isActive === false ? " (inactive)" : ""}`;
        }
        default:
            return value;
    }
}
