"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as Icons from "lucide-react";
import Link from "next/link";
import { RecordForm } from "./record-form";
import { RelatedList } from "./related-list";
import { ClaimRecordButton } from "./claim-record-button";
import { DeleteRecordButton } from "./delete-record-button";
import type { LayoutConfigV2 } from "@/lib/record-page-layout";
import { RecordCommentPanel, type RecordCommentItem } from "./record-comment-panel";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";
import { formatDateOnlyForDisplay, formatDateTimeForDisplay } from "@/lib/temporal";

type RecordHistoryEntry = {
    id: number;
    fieldApiNameSnapshot: string;
    fieldLabelSnapshot: string;
    fieldType: string;
    lookupTargetId: number | null;
    oldValueText: string | null;
    oldValueNumber: string | null;
    oldValueDate: string | null;
    oldValueBoolean: boolean | null;
    oldValueLookup: number | null;
    newValueText: string | null;
    newValueNumber: string | null;
    newValueDate: string | null;
    newValueBoolean: boolean | null;
    newValueLookup: number | null;
    changedByName: string;
    changedAt: string;
};

interface RecordDetailProps {
    objectDef: any;
    record: any;
    appApiName: string;
    lookupResolutions: Record<string, { id: number; name: string; objectApiName: string }>;
    relatedLists: any[];
    historyEntries?: RecordHistoryEntry[];
    historyLookupLabels?: Record<number, string>;
    layoutConfig?: LayoutConfigV2 | null;
    layoutConfigRaw?: LayoutConfigV2 | null;
    layoutName?: string | null;
    lookupOptions?: Record<string, { id: string; label: string }[]>;
    userOptions?: { id: string; label: string }[];
    queueOptions?: { id: string; label: string }[];
    canEdit?: boolean;
    canDelete?: boolean;
    canClaim?: boolean;
    enableChatter?: boolean;
    comments?: RecordCommentItem[];
    mentionCandidates?: { id: number; name: string; username: string }[];
    permissionSetIds?: number[];
    ownerGroupId?: number | null;
    blockedFieldApiNames?: string[];
    submitMode?: "default" | "ownUserRecord" | "adminUserRecord";
    systemInfoItems?: { label: string; value: string }[];
}

export function RecordDetail({
    objectDef,
    record,
    appApiName,
    lookupResolutions,
    relatedLists,
    historyEntries = [],
    historyLookupLabels = {},
    layoutConfig = null,
    layoutConfigRaw = null,
    layoutName = null,
    lookupOptions,
    userOptions,
    queueOptions,
    canEdit = true,
    canDelete = false,
    canClaim = false,
    enableChatter = false,
    comments = [],
    mentionCandidates = [],
    permissionSetIds,
    ownerGroupId,
    blockedFieldApiNames = [],
    submitMode = "default",
    systemInfoItems = [],
}: RecordDetailProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const layoutFieldIds = (() => {
        const sourceLayout = layoutConfigRaw ?? layoutConfig;
        const ids = new Set<number>();
        sourceLayout?.sections?.forEach((section) => {
            section.items.forEach((item) => {
                if (item.type === "field") ids.add(item.fieldId);
            });
        });
        sourceLayout?.highlights?.fields?.forEach((fieldId) => ids.add(fieldId));
        return Array.from(ids);
    })();

    if (isEditing) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Edit {objectDef.label}
                    </h1>
                    <Button variant="ghost" onClick={() => setIsEditing(false)}>
                        Cancel
                    </Button>
                </div>
                <div className="border rounded-lg p-6 bg-white shadow-sm">
                    <RecordForm
                        objectDef={objectDef}
                        record={record}
                        appApiName={appApiName}
                        lookupOptions={lookupOptions}
                        userOptions={userOptions}
                        queueOptions={queueOptions}
                        allowedFieldIds={layoutFieldIds}
                        layoutConfig={layoutConfigRaw}
                        permissionSetIds={permissionSetIds}
                        ownerGroupId={ownerGroupId}
                        blockedFieldApiNames={blockedFieldApiNames}
                        submitMode={submitMode}
                        onSuccess={() => setIsEditing(false)}
                    />
                </div>
            </div>
        );
    }

    const nameField = objectDef.fields.find((f: any) => f.apiName === "name") || objectDef.fields[0];
    const recordName = record[nameField?.apiName] || `Record #${record.id}`;
    const fieldById = new Map(objectDef.fields.map((field: any) => [field.id, field]));
    const highlightFieldIds = layoutConfig?.highlights?.fields ?? [];
    const sections = layoutConfig?.sections ?? [];
    const systemBlocks = layoutConfig?.systemBlocks ?? {};
    const isUserObject = objectDef.apiName === USER_OBJECT_API_NAME;
    const showHistory = systemBlocks.history !== false && !isUserObject;
    const showSystemInfoBlock = systemBlocks.owner !== false || systemInfoItems.length > 0;
    const highlightFields = highlightFieldIds
        .map((id) => fieldById.get(id))
        .filter(Boolean);
    const detailSections = sections.map((section) => {
        const columns = section.columns === 1 || section.columns === 2 || section.columns === 3 ? section.columns : 2;
        const columnFields: any[][] = Array.from({ length: columns }, () => []);
        section.items.forEach((item, index) => {
            if (item.type !== "field") return;
            const field = fieldById.get(item.fieldId);
            if (!field) return;
            const colIndex = item.col && item.col >= 1 && item.col <= columns
                ? item.col - 1
                : index % columns;
            columnFields[colIndex].push(field);
        });
        return {
            ...section,
            columns,
            columnFields,
        };
    });

    // Dynamic Icon
    const Icon = (Icons as any)[objectDef.icon || "Box"] || Icons.Box;
    const ownerDisplay = renderOwnerLabel(record, appApiName);

    const relatedContent = relatedLists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {relatedLists.map((list: any, idx: number) => (
                <RelatedList
                    key={idx}
                    title={list.objectLabel}
                    objectApiName={list.objectApiName}
                    records={list.records}
                    appApiName={appApiName}
                    fieldApiName={list.fieldApiName}
                    parentRecordId={record.id}
                />
            ))}
        </div>
    ) : (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <p className="text-slate-500">No related lists available.</p>
        </div>
    );

    const detailsContent = (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {detailSections.length === 0 ? (
                <div className="p-8 text-sm text-slate-500">No fields selected for this layout.</div>
            ) : (
                detailSections.map((section) => {
                    const gridCols =
                        section.columns === 1
                            ? "md:grid-cols-1"
                            : section.columns === 2
                                ? "md:grid-cols-2"
                                : "md:grid-cols-3";
                    return (
                        <div key={section.id} className="p-0">
                            <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                                <h3 className="font-semibold text-sm text-slate-700">{section.title}</h3>
                            </div>
                            <div className="p-6">
                                <div className={`grid grid-cols-1 ${gridCols} gap-x-12 gap-y-6`}>
                                    {section.columnFields.map((columnFields, colIndex) => (
                                        <dl key={`${section.id}-col-${colIndex}`} className="space-y-6">
                                            {columnFields.map((field: any) => (
                                                <div key={field.id} className="group border-b border-transparent hover:border-slate-100 pb-1 transition-colors">
                                                    <dt className="text-xs text-slate-500 mb-1">
                                                        {field.label}
                                                    </dt>
                                                    <dd className="text-sm text-slate-900 min-h-[1.5rem] flex items-center font-normal">
                                                        {renderFieldValue(field, record[field.apiName], lookupResolutions[field.apiName], appApiName)}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {showSystemInfoBlock && (
                <div className="p-0">
                    <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                        <h3 className="font-semibold text-sm text-slate-700">System Information</h3>
                    </div>
                    <div className="p-6">
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                            <div>
                                <dt className="text-xs text-slate-500 mb-1">Created By</dt>
                                <dd className="text-sm text-slate-900 flex items-center gap-2">
                                    {record.createdByName || "System"}
                                    <span className="text-slate-400 text-xs" suppressHydrationWarning>
                                        , {new Date(record.createdAt).toLocaleString()}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-slate-500 mb-1">Last Modified By</dt>
                                <dd className="text-sm text-slate-900 flex items-center gap-2">
                                    {record.lastModifiedByName || "System"}
                                    <span className="text-slate-400 text-xs" suppressHydrationWarning>
                                        , {new Date(record.updatedAt).toLocaleString()}
                                    </span>
                                </dd>
                            </div>
                            {!isUserObject && (
                                <div>
                                    <dt className="text-xs text-slate-500 mb-1">Owner</dt>
                                    <dd className="text-sm text-slate-900">
                                        {ownerDisplay}
                                    </dd>
                                </div>
                            )}
                            {systemInfoItems.map((item) => (
                                <div key={item.label}>
                                    <dt className="text-xs text-slate-500 mb-1">{item.label}</dt>
                                    <dd className="text-sm text-slate-900">{item.value || "-"}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            )}
        </div>
    );

    const historyContent = historyEntries.length > 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-sm text-slate-700">Field History</h3>
            </div>
            <div className="divide-y divide-slate-100">
                {historyEntries.map((entry) => (
                    <div key={`${entry.fieldApiNameSnapshot}-${entry.id}`} className="px-6 py-4 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium text-slate-900">
                                {entry.fieldLabelSnapshot}
                            </div>
                            <div className="text-xs text-slate-400" suppressHydrationWarning>
                                {new Date(entry.changedAt).toLocaleString()}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                            <span className="text-slate-500">
                                {formatHistoryValue(entry, "old", historyLookupLabels)}
                            </span>
                            <Icons.ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-900">
                                {formatHistoryValue(entry, "new", historyLookupLabels)}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500">
                            by {entry.changedByName}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    ) : (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <p className="text-slate-500">No field history yet.</p>
        </div>
    );

    const chatterContent = enableChatter ? (
        <RecordCommentPanel
            recordId={record.id}
            comments={comments}
            mentionCandidates={mentionCandidates}
        />
    ) : null;

    return (
        <div className="min-h-screen bg-slate-100 pb-24">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto max-w-7xl px-6 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                                <Icon className="h-6 w-6 text-amber-600" />
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                                    {objectDef.label} • {record.id}
                                </div>
                                <h1 className="text-2xl font-semibold text-slate-900 leading-tight">
                                    {recordName}
                                </h1>
                                <div className="text-sm text-slate-500 flex flex-wrap items-center gap-2">
                                    <span suppressHydrationWarning>
                                        Updated {new Date(record.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {canClaim && (
                                <ClaimRecordButton
                                    objectApiName={record.objectApiName}
                                    recordId={record.id}
                                />
                            )}
                            {canEdit ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditing(true)}
                                    className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                                >
                                    <Icons.Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                            ) : (
                                <Button disabled variant="outline" className="border-slate-300 text-slate-400">
                                    <Icons.Lock className="mr-2 h-4 w-4" />
                                    Read Only
                                </Button>
                            )}
                            {canDelete ? (
                                <DeleteRecordButton
                                    appApiName={appApiName}
                                    objectApiName={record.objectApiName}
                                    recordId={record.id}
                                    recordLabel={recordName}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
                {highlightFields.length > 0 && (
                    <div className="border-t border-slate-200 bg-white">
                        <div className="mx-auto max-w-7xl px-6 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {highlightFields.map((field: any) => (
                                    <div key={field.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                                        <div className="text-[11px] uppercase tracking-wide text-slate-400">{field.label}</div>
                                        <div className="text-sm font-semibold text-slate-900 mt-1">
                                            {renderFieldValue(field, record[field.apiName], lookupResolutions[field.apiName], appApiName)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            <div className="mx-auto max-w-7xl px-6 pt-6">
                <div className={enableChatter ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start" : "space-y-8"}>
                    <div>
                        {isMounted ? (
                            <Tabs defaultValue="details" className="w-full">
                                <TabsList className="w-full justify-start bg-white border-b border-slate-200 rounded-none p-0 shadow-none mb-4">
                                    <TabsTrigger
                                        value="details"
                                        className="rounded-none border-b-2 border-transparent px-6 py-3 text-sm font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600"
                                    >
                                        Details
                                    </TabsTrigger>
                                    {showHistory && (
                                        <TabsTrigger
                                            value="history"
                                            className="rounded-none border-b-2 border-transparent px-6 py-3 text-sm font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600"
                                        >
                                            History
                                        </TabsTrigger>
                                    )}
                                </TabsList>

                                <TabsContent value="details" className="animate-in fade-in-50 duration-300">
                                    <div className="space-y-6">
                                        {detailsContent}
                                        {relatedContent}
                                    </div>
                                </TabsContent>

                                {showHistory && (
                                    <TabsContent value="history" className="animate-in fade-in-50 duration-300">
                                        {historyContent}
                                    </TabsContent>
                                )}
                            </Tabs>
                        ) : (
                            <div className="space-y-8">
                                {detailsContent}
                                {relatedContent}
                                {historyContent}
                            </div>
                        )}
                    </div>
                    {chatterContent && <div className="lg:sticky lg:top-6">{chatterContent}</div>}
                </div>
            </div>
        </div>
    );
}

function renderFieldValue(field: any, value: any, lookupResolution: any, appApiName: string) {
    if (value === null || value === undefined || value === "") {
        return <span className="text-muted-foreground">-</span>;
    }

    switch (field.type) {
        case "File": {
            const attachment = value;
            if (!attachment || typeof attachment !== "object") {
                return <span className="text-muted-foreground">-</span>;
            }
            const options = field.options && !Array.isArray(field.options) ? field.options : {};
            const displayMode = options.displayMode ?? "link";
            const isImage = Boolean(attachment.mimeType?.startsWith("image/"));
            const downloadUrl = attachment.downloadUrl || `/api/files/${attachment.id}`;

            if (isImage && displayMode === "inline") {
                return (
                    <ImageLightbox
                        src={`${downloadUrl}?inline=1`}
                        alt={attachment.displayName || attachment.filename || "Attachment"}
                        className="max-h-48 rounded border border-slate-200"
                    />
                );
            }

            return (
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {attachment.displayName || attachment.filename || "Download"}
                </a>
            );
        }
        case "Lookup":
            if (lookupResolution) {
                return (
                    <Link
                        href={`/app/${appApiName}/${lookupResolution.objectApiName}/${lookupResolution.id}`}
                        className="text-primary hover:underline font-semibold"
                    >
                        {lookupResolution.name}
                    </Link>
                );
            }
            return value; // Fallback to ID if resolution missing
        case "Url":
            return (
                <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {value}
                </a>
            );
        case "Email":
            return (
                <a href={`mailto:${value}`} className="text-primary hover:underline">
                    {value}
                </a>
            );
        case "Checkbox":
            return value === "true" || value === true ? "Yes" : "No";
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
        case "Picklist": {
            const options = Array.isArray(field.picklistOptions) ? field.picklistOptions : [];
            const match = options.find((opt: any) => String(opt.id) === String(value));
            if (!match) return value;
            return (
                <span>
                    {match.label}{match.isActive === false ? " (inactive)" : ""}
                </span>
            );
        }
        case "TextArea":
            return <span className="whitespace-pre-wrap">{value}</span>;
        default:
            return value;
    }
}

function renderOwnerLabel(record: any, appApiName: string) {
    const ownerName = record.ownerName || "Unassigned";

    if (record.ownerType === "USER" && record.ownerUserRecordId) {
        return (
            <Link
                href={`/app/${appApiName}/user/${record.ownerUserRecordId}`}
                className="text-primary hover:underline"
            >
                {ownerName}
            </Link>
        );
    }

    return <span>{ownerName}</span>;
}

function formatHistoryValue(
    entry: RecordHistoryEntry,
    kind: "old" | "new",
    lookupLabels: Record<number, string>
) {
    const textValue = kind === "old" ? entry.oldValueText : entry.newValueText;
    const numberValue = kind === "old" ? entry.oldValueNumber : entry.newValueNumber;
    const dateValue = kind === "old" ? entry.oldValueDate : entry.newValueDate;
    const boolValue = kind === "old" ? entry.oldValueBoolean : entry.newValueBoolean;
    const lookupValue = kind === "old" ? entry.oldValueLookup : entry.newValueLookup;

    switch (entry.fieldType) {
        case "Number":
        case "Currency":
            return numberValue ?? textValue ?? "-";
        case "Date":
            return dateValue ? (
                <span suppressHydrationWarning>
                    {formatDateOnlyForDisplay(dateValue) ?? dateValue}
                </span>
            ) : (
                "-"
            );
        case "DateTime":
            return dateValue ? (
                <span suppressHydrationWarning>
                    {formatDateTimeForDisplay(dateValue) ?? dateValue}
                </span>
            ) : (
                "-"
            );
        case "Checkbox":
            if (boolValue === null || boolValue === undefined) return "-";
            return boolValue ? "Yes" : "No";
        case "Lookup":
            if (!lookupValue) return "-";
            return lookupLabels[lookupValue] ?? `Record #${lookupValue}`;
        default:
            return textValue ?? "-";
    }
}
