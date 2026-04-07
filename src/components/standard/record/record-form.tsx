"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { createRecord, updateOwnUserRecord, updateRecord } from "@/actions/standard/record-actions";
import { updateManagedUserRecord } from "@/actions/admin/user-actions";
import { Loader2 } from "lucide-react";
import { applyLayoutVisibility, normalizeRecordPageLayoutConfig, type LayoutConfigV2 } from "@/lib/record-page-layout";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";
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

interface RecordFormProps {
    objectDef: any;
    record?: any; // If present, edit mode
    appApiName: string;
    lookupOptions?: Record<string, { id: string; label: string }[]>;
    userOptions?: { id: string; label: string }[]; // Add userOptions prop
    queueOptions?: { id: string; label: string }[];
    allowedFieldIds?: number[];
    layoutConfig?: LayoutConfigV2 | null;
    layoutAssignments?: {
        id: number;
        permissionSetId?: number | null;
        layout: { id: number; name: string; config: any };
    }[];
    defaultLayout?: { id: number; name: string; config: any } | null;
    permissionSetIds?: number[];
    ownerGroupId?: number | null;
    blockedFieldApiNames?: string[];
    submitMode?: "default" | "ownUserRecord" | "adminUserRecord";
    onSuccess?: () => void;
    extraSchemaShape?: Record<string, z.ZodTypeAny>;
    extraDefaultValues?: Record<string, any>;
    renderExtraFields?: (args: { form: any; isLoading: boolean }) => ReactNode;
    submitOverride?: (values: Record<string, any>) => Promise<any>;
    submitLabel?: string;
}

type DuplicateMatchItem = {
    recordId: number;
    name: string;
    matchedRuleNames: string[];
    matchedFieldLabels: string[];
};

type DuplicateWarningState = {
    warningRuleIds: number[];
    visibleMatches: DuplicateMatchItem[];
    hiddenMatchCount: number;
};

export function RecordForm({
    objectDef,
    record,
    appApiName,
    lookupOptions = {},
    userOptions,
    queueOptions,
    allowedFieldIds,
    layoutConfig,
    layoutAssignments,
    defaultLayout,
    permissionSetIds,
    ownerGroupId,
    blockedFieldApiNames = [],
    submitMode = "default",
    onSuccess,
    extraSchemaShape = {},
    extraDefaultValues = {},
    renderExtraFields,
    submitOverride,
    submitLabel,
}: RecordFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarningState | null>(null);
    const [pendingSubmitValues, setPendingSubmitValues] = useState<Record<string, any> | null>(null);
    const [ownerType, setOwnerType] = useState<"USER" | "QUEUE">(
        record?.ownerType === "QUEUE" ? "QUEUE" : "USER"
    );

    // 1. Build Dynamic Schema
    const baseFields = useMemo(() => {
        const blocked = new Set(blockedFieldApiNames);
        const filtered = objectDef.fields.filter((field: any) => !blocked.has(field.apiName));
        if (!allowedFieldIds) return filtered;
        const allowed = new Set(allowedFieldIds);
        return filtered.filter((field: any) => allowed.has(field.id));
    }, [objectDef.fields, allowedFieldIds, blockedFieldApiNames]);

    const schemaShape: any = {};
    const isNewRecord = !record;
    const isUserObject = objectDef.apiName === USER_OBJECT_API_NAME;
    const hasAssignmentSelection = isNewRecord && Boolean(layoutAssignments?.length || defaultLayout);
    const activeLayoutConfig = useMemo(() => {
        if (layoutConfig) return layoutConfig;
        if (!hasAssignmentSelection) return null;

        const permissionSetIdSet = new Set(permissionSetIds || []);
        const assignments = layoutAssignments || [];

        const matches = assignments.filter((assignment) => {
            if (assignment.permissionSetId && !permissionSetIdSet.has(assignment.permissionSetId)) {
                return false;
            }
            return true;
        });

        const scored = matches.map((assignment) => ({
            assignment,
            score: assignment.permissionSetId ? 1 : 0,
        }));

        const selected = scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.assignment.id - b.assignment.id;
        })[0]?.assignment;

        const chosenLayout = selected?.layout || defaultLayout;
        if (!chosenLayout) return null;

        return normalizeRecordPageLayoutConfig(
            chosenLayout.config as any,
            baseFields.map((field: any) => ({
                id: field.id,
                required: field.required,
                type: field.type,
            }))
        );
    }, [
        layoutConfig,
        hasAssignmentSelection,
        layoutAssignments,
        defaultLayout,
        permissionSetIds,
        baseFields,
    ]);
    const isCreateWithLayout = isNewRecord && Boolean(activeLayoutConfig);

    baseFields.forEach((field: any) => {
        if (field.type === "File") {
            return;
        }
        let fieldSchema;
        if (field.type === "AutoNumber") {
            fieldSchema = z.union([z.string(), z.null(), z.undefined()]).optional();
            schemaShape[field.apiName] = fieldSchema;
            return;
        }
        switch (field.type) {
            case "Number":
                // FIX: Use z.coerce.number() to handle string input from HTML forms
                if (field.required) {
                    fieldSchema = isCreateWithLayout
                        ? z.union([z.coerce.number(), z.string().length(0), z.null(), z.undefined()])
                            .transform(val => val === "" ? null : val)
                        : z.string().min(1, "Required").pipe(z.coerce.number());
                } else {
                    fieldSchema = z.union([z.coerce.number(), z.string().length(0), z.null(), z.undefined()])
                        .transform(val => val === "" ? null : val);
                }
                break;
            case "Checkbox":
                // Handle boolean (from form) or string "true"/"false" (from DB)
                fieldSchema = z.union([z.boolean(), z.string()])
                    .transform((val) => val === true || val === "true");
                break;
            case "Email":
                if (field.required) {
                    fieldSchema = isCreateWithLayout
                        ? z.union([z.string().email("Invalid email"), z.literal("")]).optional()
                        : z.string().min(1, "Required").email("Invalid email");
                } else {
                    fieldSchema = z.union([z.string().email("Invalid email"), z.literal("")]).optional();
                }
                break;
            case "Url":
                if (field.required) {
                    fieldSchema = isCreateWithLayout
                        ? z.union([z.string().url("Invalid URL"), z.literal("")]).optional()
                        : z.string().min(1, "Required").url("Invalid URL");
                } else {
                    fieldSchema = z.union([z.string().url("Invalid URL"), z.literal("")]).optional();
                }
                break;
            case "Phone":
                const phoneRegex = /^\+?[0-9]{10,15}$/;
                if (field.required) {
                    fieldSchema = isCreateWithLayout
                        ? z.union([z.string().regex(phoneRegex, "Invalid phone number"), z.literal("")]).optional()
                        : z.string().min(1, "Required").regex(phoneRegex, "Invalid phone number");
                } else {
                    fieldSchema = z.union([z.string().regex(phoneRegex, "Invalid phone number"), z.literal("")]).optional();
                }
                break;
            default:
                if (field.required) {
                    fieldSchema = isCreateWithLayout
                        ? z.union([z.string(), z.null(), z.undefined()]).optional()
                        : z.string().min(1, "Required");
                } else {
                    fieldSchema = z.union([z.string(), z.null(), z.undefined()]).optional();
                }
        }
        schemaShape[field.apiName] = fieldSchema;
    });

    if (!isUserObject) {
        // Add ownerId to schema manually since it's a system field
        schemaShape["ownerId"] = z.string().optional();
        schemaShape["ownerQueueId"] = z.string().optional();
    }

    Object.assign(schemaShape, extraSchemaShape);

    const formSchema = z.object(schemaShape);

    // 2. Get Pre-filled Values from URL
    const searchParams = useSearchParams();
    const defaultValues: any = {};

    baseFields.forEach((field: any) => {
        if (field.type === "File") {
            return;
        }
        // Check if there's a pre-filled value from URL
        const urlValue = searchParams.get(field.apiName);
        if (urlValue) {
            defaultValues[field.apiName] = urlValue;
        } else if (record) {
            // If editing, use existing record data
            defaultValues[field.apiName] = record[field.apiName] ?? "";
        } else {
            // Default values for new records
            if (field.type === "Checkbox") {
                defaultValues[field.apiName] = false;
            } else if (field.type === "Number") {
                defaultValues[field.apiName] = "";
            } else {
                defaultValues[field.apiName] = "";
            }
        }
    });

    // Add ownerId to defaultValues
    if (record && !isUserObject) {
        defaultValues["ownerId"] = record.ownerId ? String(record.ownerId) : "";
        defaultValues["ownerQueueId"] = record.ownerQueueId ? String(record.ownerQueueId) : "";
    }

    Object.assign(defaultValues, extraDefaultValues);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues,
    });
    const formValues = useWatch({ control: form.control }) || {};
    const ownerIdValue = form.watch("ownerId") as string | undefined;
    const ownerQueueValue = form.watch("ownerQueueId") as string | undefined;

    const fieldIdToApi = useMemo(() => {
        const map: Record<number, string> = {};
        baseFields.forEach((f: any) => {
            map[f.id] = f.apiName;
        });
        return map;
    }, [baseFields]);

    const visibleFieldIds = useMemo(() => {
        if (!activeLayoutConfig) return baseFields.map((field: any) => field.id);

        const visibleLayout = applyLayoutVisibility(activeLayoutConfig, {
            recordValues: formValues,
            ownerGroupId: ownerGroupId ?? null,
            permissionSetIds: permissionSetIds || [],
            fields: baseFields.map((field: any) => ({
                id: field.id,
                apiName: field.apiName,
                type: field.type,
            })),
        });

        const ids = new Set<number>();
        visibleLayout.sections.forEach((section) => {
            section.items.forEach((item) => ids.add(item.fieldId));
        });
        return Array.from(ids);
    }, [
        activeLayoutConfig,
        permissionSetIds,
        ownerGroupId,
        baseFields,
        formValues,
    ]);

    const visibleFieldIdSet = useMemo(
        () => new Set<number>(visibleFieldIds as number[]),
        [visibleFieldIds]
    );
    const fieldsForDisplay = useMemo(() => {
        return baseFields.filter((field: any) => visibleFieldIdSet.has(field.id));
    }, [baseFields, visibleFieldIdSet]);

    const prevVisibleRef = useRef<Set<number> | null>(null);

    useEffect(() => {
        if (!isCreateWithLayout) return;
        const prev = prevVisibleRef.current;
        if (prev) {
            const nowHidden = baseFields.filter((field: any) => prev.has(field.id) && !visibleFieldIdSet.has(field.id));
            nowHidden.forEach((field: any) => {
                if (field.type === "File") return;
                const emptyValue =
                    field.type === "Checkbox"
                        ? false
                        : field.type === "Number"
                            ? ""
                            : "";
                form.setValue(field.apiName, emptyValue, { shouldDirty: true, shouldValidate: false });
            });
        }
        prevVisibleRef.current = visibleFieldIdSet;
    }, [isCreateWithLayout, baseFields, visibleFieldIdSet, form]);

    async function submitValues(values: z.infer<typeof formSchema>, duplicateConfirmRuleIds: number[] = []) {
        setIsLoading(true);
        try {
            if (isCreateWithLayout) {
                const missing: string[] = [];
                baseFields.forEach((field: any) => {
                    if (!field.required || !visibleFieldIdSet.has(field.id)) return;
                    if (field.type === "File") {
                        const hasAttachment = record?.[field.apiName];
                        if (hasAttachment) return;
                        // File uploads are handled separately, so don't block save here.
                        return;
                    }
                    if (field.type === "AutoNumber") {
                        return;
                    }
                    const value = values[field.apiName as keyof typeof values];
                    if (value === undefined || value === null || value === "") {
                        missing.push(field.apiName);
                        form.setError(field.apiName as any, { type: "server", message: "Required" });
                    }
                });
                if (missing.length) {
                    setIsLoading(false);
                    return;
                }
            }
            const cleanedValues = { ...values };
            if (isUserObject || submitMode === "ownUserRecord" || submitMode === "adminUserRecord") {
                delete (cleanedValues as Record<string, unknown>).ownerId;
                delete (cleanedValues as Record<string, unknown>).ownerQueueId;
            }
            if (duplicateConfirmRuleIds.length > 0) {
                (cleanedValues as Record<string, unknown>).__duplicateConfirmRuleIds = duplicateConfirmRuleIds;
            }

            let result;
            if (submitOverride) {
                result = await submitOverride(cleanedValues);
            } else if (record) {
                result =
                    submitMode === "ownUserRecord"
                        ? await updateOwnUserRecord(record.id, cleanedValues)
                        : submitMode === "adminUserRecord"
                            ? await updateManagedUserRecord(record.backingUserId, cleanedValues)
                            : await updateRecord(objectDef.apiName, record.id, cleanedValues);
            } else {
                result = await createRecord(objectDef.apiName, cleanedValues);
            }

            if (result.success) {
                setInlineError(null);
                setDuplicateWarning(null);
                setPendingSubmitValues(null);
                form.clearErrors();
                toast.success(record ? "Record updated" : "Record created");

                if (onSuccess) {
                    onSuccess();
                }

                // Only redirect if creating a new record
                const resultData = (result as any).data;
                if (!record && resultData?.id) {
                    router.push(`/app/${appApiName}/${objectDef.apiName}/${resultData.id}`);
                } else {
                    router.refresh();
                }
            } else {
                if (result.duplicateStatus === "warn") {
                    setInlineError(null);
                    setPendingSubmitValues({ ...values });
                    setDuplicateWarning({
                        warningRuleIds: result.duplicateMatches?.warningRuleIds || [],
                        visibleMatches: result.duplicateMatches?.visibleMatches || [],
                        hiddenMatchCount: result.duplicateMatches?.hiddenMatchCount || 0,
                    });
                } else if (result.errorPlacement === "inline") {
                    const apiName = result.errorFieldId ? fieldIdToApi[result.errorFieldId] : undefined;
                    if (apiName) {
                        form.setError(apiName as any, { type: "server", message: result.error || "Validation failed" });
                    } else {
                        setInlineError(result.error || "Validation failed");
                    }
                } else if (result.error) {
                    let appliedFieldErrors = false;
                    try {
                        const parsed = JSON.parse(result.error);
                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                            Object.entries(parsed).forEach(([fieldApiName, message]) => {
                                if (typeof message !== "string") return;
                                form.setError(fieldApiName as any, { type: "server", message });
                                appliedFieldErrors = true;
                            });
                        }
                    } catch {
                        // Not a JSON payload; fall back to toast.
                    }

                    if (appliedFieldErrors) {
                        setInlineError(null);
                        toast.error("Fix the highlighted fields.");
                    } else {
                        toast.error(result.error || "An error occurred");
                    }
                } else {
                    toast.error(result.error || "An error occurred");
                }
            }
        } catch (error) {
            console.error("Form submission error:", error);
            toast.error("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    }

    // 3. Handle Submit
    async function onSubmit(values: z.infer<typeof formSchema>) {
        await submitValues(values);
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {inlineError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                        <span className="font-bold">Error:</span> {inlineError}
                    </div>
                )}

                {/* Metadata Display (Read-only) */}
                {record && (
                    <div className="flex flex-col sm:flex-row gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex-1">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Created</span>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-sm font-medium">{record.createdByName || "Unknown"}</span>
                                <span className="text-xs text-muted-foreground">
                                    on {new Date(record.createdAt).toISOString().split("T")[0]}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Modified</span>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-sm font-medium">
                                    {new Date(record.updatedAt).toISOString().split("T")[0]}
                                </span>
                            </div>
                        </div>
                        {/* Owner Display (Read-only if not editing owner) */}
                        {!userOptions && !isUserObject && (
                            <div className="flex-1">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Owner</span>
                                <div className="text-sm font-medium mt-1">{record.ownerName || "Unknown"}</div>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Owner Field (Edit Mode Only - Full Width) */}
                    {record && !isUserObject && (userOptions || queueOptions) && (
                        <div className="md:col-span-2 p-4 border border-border/60 rounded-lg bg-card/50">
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                Record Ownership
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center mb-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium leading-none">Owner Type</label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        Choose a user or a queue as the owner.
                                    </p>
                                </div>
                                <Select
                                    onValueChange={(val) => {
                                        const next = val === "QUEUE" ? "QUEUE" : "USER";
                                        setOwnerType(next);
                                        if (next === "QUEUE") {
                                            form.setValue("ownerId", "");
                                            if (!form.getValues("ownerQueueId") && queueOptions?.[0]?.id) {
                                                form.setValue("ownerQueueId", queueOptions[0].id);
                                            }
                                        } else {
                                            form.setValue("ownerQueueId", "");
                                            if (!form.getValues("ownerId") && userOptions?.[0]?.id) {
                                                form.setValue("ownerId", userOptions[0].id);
                                            }
                                        }
                                    }}
                                    value={ownerType}
                                >
                                    <SelectTrigger className="bg-background">
                                        <SelectValue placeholder="Select owner type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USER">User</SelectItem>
                                        <SelectItem value="QUEUE">Queue</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {ownerType === "USER" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">
                                            Owner
                                        </label>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Transfer ownership to a specific user.
                                        </p>
                                    </div>
                                    <Select
                                        onValueChange={(val) => form.setValue("ownerId", val)}
                                        value={ownerIdValue || ""}
                                        disabled={!userOptions?.length}
                                    >
                                        <SelectTrigger className="bg-background">
                                            <SelectValue placeholder={userOptions?.length ? "Select owner" : "No users available"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(userOptions || []).map((user) => (
                                                <SelectItem key={user.id} value={user.id}>
                                                    {user.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">
                                            Queue
                                        </label>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Assign this record to a queue.
                                        </p>
                                    </div>
                                    <Select
                                        onValueChange={(val) => form.setValue("ownerQueueId", val)}
                                        value={ownerQueueValue || ""}
                                        disabled={!queueOptions?.length}
                                    >
                                        <SelectTrigger className="bg-background">
                                            <SelectValue placeholder={queueOptions?.length ? "Select queue" : "No queues available"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(queueOptions || []).map((queue) => (
                                                <SelectItem key={queue.id} value={queue.id}>
                                                    {queue.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    {renderExtraFields?.({ form, isLoading })}

                    {/* Dynamic Fields */}
                {fieldsForDisplay.map((field: any) =>
                    field.type === "File" ? (
                        <FileFieldInput
                            key={field.id}
                            fieldDef={field}
                            recordId={record?.id}
                            existingAttachment={record?.[field.apiName] ?? null}
                            disabled={!record}
                        />
                    ) : (
                        <FormField
                            key={field.id}
                            control={form.control}
                            name={field.apiName}
                            render={({ field: formField }) => (
                                    <FormItem className="space-y-1.5">
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {field.label} {field.required && <span className="text-destructive">*</span>}
                                        </FormLabel>
                                        <FormControl>
                                            {renderInput(field, formField, lookupOptions[field.apiName] || [])}
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                        />
                    )
                )}
                </div>

                <div className="flex gap-4 pt-4 border-t border-border/50">
                    <Button type="submit" disabled={isLoading} className="shadow-sm">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {submitLabel || (record ? "Save Changes" : "Create Record")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                        if (onSuccess) onSuccess();
                        else router.back();
                    }}>
                        Cancel
                    </Button>
                </div>
            </form>

            <AlertDialog
                open={Boolean(duplicateWarning)}
                onOpenChange={(open) => {
                    if (!open) {
                        setDuplicateWarning(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Possible duplicates found</AlertDialogTitle>
                        <AlertDialogDescription>
                            This save matches one or more duplicate rules. Review the matching records before you continue.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4">
                        {duplicateWarning?.visibleMatches.length ? (
                            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                                {duplicateWarning.visibleMatches.map((match) => (
                                    <div key={match.recordId} className="rounded-lg border bg-muted/20 p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-medium">{match.name}</div>
                                            <Link
                                                href={`/app/${appApiName}/${objectDef.apiName}/${match.recordId}`}
                                                className="text-xs text-primary hover:underline"
                                            >
                                                Open record
                                            </Link>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            Rules: {match.matchedRuleNames.join(", ")}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            Matching fields: {match.matchedFieldLabels.join(", ")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                                Matching records exist, but you do not have access to view them.
                            </div>
                        )}

                        {duplicateWarning && duplicateWarning.hiddenMatchCount > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                Additional possible duplicates exist but you do not have access to view them.
                            </div>
                        )}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                setDuplicateWarning(null);
                                setPendingSubmitValues(null);
                            }}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (!duplicateWarning || !pendingSubmitValues) return;
                                const confirmRuleIds = duplicateWarning.warningRuleIds;
                                setDuplicateWarning(null);
                                await submitValues(pendingSubmitValues as z.infer<typeof formSchema>, confirmRuleIds);
                            }}
                        >
                            Save Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Form>
    );
}

function renderInput(fieldDef: any, formField: any, options: { id: string; label: string }[] = []) {
    const fieldOptions = fieldDef.options && !Array.isArray(fieldDef.options) ? fieldDef.options : {};
    const decimalPlaces =
        typeof fieldOptions?.decimalPlaces === "number" ? Math.max(0, Math.floor(fieldOptions.decimalPlaces)) : undefined;
    const decimalStep =
        decimalPlaces === undefined
            ? "any"
            : decimalPlaces === 0
                ? "1"
                : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`;

    switch (fieldDef.type) {
        case "Picklist": {
            const allOptions = Array.isArray(fieldDef.picklistOptions)
                ? fieldDef.picklistOptions
                : [];
            const activeOptions = allOptions.filter((opt: any) => opt.isActive !== false);
            const selected = allOptions.find((opt: any) => String(opt.id) === String(formField.value));
            const optionList = selected && selected.isActive === false
                ? [selected, ...activeOptions]
                : activeOptions;

            return (
                <Select onValueChange={formField.onChange} defaultValue={formField.value ? String(formField.value) : undefined}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                        {optionList.map((opt: any) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>
                                {opt.label}{opt.isActive === false ? " (inactive)" : ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }
        case "Lookup":
            return (
                <Select onValueChange={formField.onChange} defaultValue={formField.value ? String(formField.value) : undefined}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a record" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        case "Checkbox":
            return (
                <div className="flex items-center space-x-2">
                    <Checkbox
                        checked={formField.value === 'true' || formField.value === true}
                        onCheckedChange={(checked) => formField.onChange(checked)}
                    />
                </div>
            );
        case "Date":
            return <Input type="date" {...formField} value={formatDateOnlyForInput(formField.value)} />;
        case "DateTime":
            return <Input type="datetime-local" {...formField} value={formatDateTimeForInput(formField.value)} />;
        case "Number":
            return (
                <Input
                    type="number"
                    step={decimalStep}
                    inputMode="decimal"
                    {...formField}
                    value={formField.value ?? ''}
                    onChange={e => formField.onChange(e.target.value)}
                />
            );
        case "TextArea":
            return (
                <Textarea
                    {...formField}
                    value={formField.value ?? ''}
                />
            );
        case "AutoNumber":
            return (
                <Input
                    {...formField}
                    value={formField.value ?? ''}
                    readOnly
                    placeholder="Auto-generated"
                    className="bg-muted/20 text-muted-foreground"
                />
            );
        default:
            return <Input {...formField} value={formField.value ?? ''} />;
    }
}

type FileAttachmentValue = {
    id: number;
    displayName: string;
    filename: string;
    mimeType: string;
    size: number;
    downloadUrl: string;
};

function getFileAccept(allowedTypes: string) {
    if (allowedTypes === "images") return "image/*";
    if (allowedTypes === "pdf") return "application/pdf";
    if (allowedTypes === "docx") {
        return ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return "image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function formatFileSize(size?: number) {
    if (!size || size <= 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
}

function FileFieldInput({
    fieldDef,
    recordId,
    existingAttachment,
    disabled,
}: {
    fieldDef: any;
    recordId?: number;
    existingAttachment?: FileAttachmentValue | null;
    disabled?: boolean;
}) {
    const [attachment, setAttachment] = useState<FileAttachmentValue | null>(existingAttachment ?? null);
    const [displayName, setDisplayName] = useState(existingAttachment?.displayName ?? "");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [cacheBuster, setCacheBuster] = useState(() => Date.now());
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setAttachment(existingAttachment ?? null);
        setDisplayName(existingAttachment?.displayName ?? "");
        setCacheBuster(Date.now());
    }, [existingAttachment]);

    const options = fieldDef.options && !Array.isArray(fieldDef.options) ? fieldDef.options : {};
    const allowedTypes = options.allowedTypes ?? "all";
    const accept = getFileAccept(allowedTypes);
    const displayMode = allowedTypes === "images" ? options.displayMode ?? "link" : "link";
    const isImage = Boolean(attachment?.mimeType?.startsWith("image/"));
    const appendQueryParams = (url: string, params: Record<string, string>) => {
        const query = Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");
        return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
    };

    const baseDownloadUrl = attachment?.downloadUrl || (attachment?.id ? `/api/files/${attachment.id}` : "");
    const downloadUrl = baseDownloadUrl
        ? appendQueryParams(baseDownloadUrl, { v: String(cacheBuster) })
        : "";
    const inlineUrl = downloadUrl ? appendQueryParams(downloadUrl, { inline: "1" }) : "";

    const handleUpload = async () => {
        if (!recordId || !selectedFile) return;
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("recordId", String(recordId));
            formData.append("fieldDefId", String(fieldDef.id));
            formData.append("displayName", displayName.trim() || selectedFile.name);
            formData.append("file", selectedFile);

            const response = await fetch("/api/files/upload", {
                method: "POST",
                body: formData,
            });

            const payload = await response.json();
            if (!response.ok) {
                toast.error(payload?.error || "Failed to upload file.");
                return;
            }

            const nextAttachment = payload?.attachment as FileAttachmentValue | undefined;
            if (nextAttachment) {
                setAttachment(nextAttachment);
                setDisplayName(nextAttachment.displayName);
                setSelectedFile(null);
                setCacheBuster(Date.now());
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                toast.success("File uploaded.");
            }
        } catch (error) {
            console.error("File upload failed:", error);
            toast.error("Failed to upload file.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <FormItem className="space-y-1.5">
            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {fieldDef.label} {fieldDef.required && <span className="text-destructive">*</span>}
            </FormLabel>
            <div className="space-y-3">
                {attachment ? (
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 space-y-2">
                        <div className="text-sm font-medium text-foreground">{attachment.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                            {attachment.filename}
                            {attachment.size ? ` • ${formatFileSize(attachment.size)}` : ""}
                        </div>
                        {isImage && displayMode === "inline" ? (
                            <ImageLightbox
                                src={inlineUrl}
                                alt={attachment.displayName}
                                className="max-h-48 rounded border border-border/60"
                            />
                        ) : (
                            <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary text-xs font-medium hover:underline"
                            >
                                Download
                            </a>
                        )}
                    </div>
                ) : (
                    <div className="text-xs text-muted-foreground">No file uploaded.</div>
                )}

                {disabled ? (
                    <div className="text-xs text-muted-foreground">Save the record before uploading a file.</div>
                ) : (
                    <div className="space-y-2">
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                            Uploading saves immediately and replaces the existing file, even if you don&apos;t save this form.
                        </div>
                        <Input
                            placeholder="Display name (e.g. Credit report)"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                        />
                        <Input
                            ref={fileInputRef}
                            type="file"
                            accept={accept}
                            onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                setSelectedFile(file);
                                if (file && !displayName.trim()) {
                                    setDisplayName(file.name);
                                }
                            }}
                        />
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleUpload}
                            disabled={!selectedFile || isUploading}
                        >
                            {isUploading ? "Uploading..." : attachment ? "Replace file" : "Upload file"}
                        </Button>
                    </div>
                )}
            </div>
        </FormItem>
    );
}
