"use client";

import { useMemo, useState } from "react";
import * as z from "zod";
import { updateManagedUserProfile } from "@/actions/admin/user-actions";
import { RecordForm } from "@/components/standard/record/record-form";
import { Button } from "@/components/ui/button";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { LayoutConfigV2 } from "@/lib/record-page-layout";
import { USER_ID_FIELD_API_NAME } from "@/lib/user-companion";
import { formatDateOnlyForDisplay, formatDateTimeForDisplay } from "@/lib/temporal";
import { Pencil } from "lucide-react";

const accountSchemaShape = {
    accountName: z.string().trim().min(1, "Name is required"),
    accountUsername: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-z0-9]+$/, "Username must be lowercase letters and numbers only"),
    accountEmail: z
        .string()
        .trim()
        .optional()
        .refine((value) => !value || z.string().email().safeParse(value).success, "Invalid email address"),
    accountUserType: z.enum(["standard", "admin"]),
    accountGroupId: z.string(),
};

interface ManagedUserProfileFormProps {
    user: {
        id: number;
        name: string | null;
        username: string;
        email: string | null;
        userType: "admin" | "standard";
        groupId: number | null;
    };
    groups: { id: number; name: string }[];
    companionRecord: any;
    flattenedCompanionRecord: any;
    layoutConfig?: LayoutConfigV2 | null;
    lookupResolutions?: Record<string, { id: number; name: string; objectApiName: string }>;
}

type CompanionField = {
    id: number;
    apiName: string;
    type: string;
    label?: string | null;
    options?: unknown;
    picklistOptions?: Array<{ id: number; label: string; isActive?: boolean }>;
};

export function ManagedUserProfileForm({
    user,
    groups,
    companionRecord,
    flattenedCompanionRecord,
    layoutConfig = null,
    lookupResolutions = {},
}: ManagedUserProfileFormProps) {
    const [isEditing, setIsEditing] = useState(false);

    const systemFieldApiNames = useMemo(
        () => new Set(["name", USER_ID_FIELD_API_NAME]),
        []
    );

    const fieldById = useMemo(
        () => new Map<number, CompanionField>(companionRecord.objectDef.fields.map((field: CompanionField) => [field.id, field])),
        [companionRecord.objectDef.fields]
    );

    const customFields = useMemo(
        () => companionRecord.objectDef.fields.filter((field: CompanionField) => !systemFieldApiNames.has(field.apiName)),
        [companionRecord.objectDef.fields, systemFieldApiNames]
    );

    const detailSections = useMemo(() => {
        const sourceSections = layoutConfig?.sections?.length
            ? layoutConfig.sections
            : [
                  {
                      id: "details",
                      title: "Details",
                      columns: 2,
                      items: customFields.map((field: any, index: number) => ({
                          type: "field" as const,
                          fieldId: field.id,
                          col: (index % 2) + 1,
                      })),
                  },
              ];

        return sourceSections
            .map((section: LayoutConfigV2["sections"][number]) => {
                const columns = section.columns === 1 || section.columns === 2 || section.columns === 3 ? section.columns : 2;
                const columnFields: CompanionField[][] = Array.from({ length: columns }, () => []);

                section.items.forEach((item: LayoutConfigV2["sections"][number]["items"][number], index: number) => {
                    const field = fieldById.get(item.fieldId);
                    if (!field || systemFieldApiNames.has(field.apiName)) return;
                    const colIndex =
                        item.col && item.col >= 1 && item.col <= columns ? item.col - 1 : index % columns;
                    columnFields[colIndex].push(field);
                });

                return {
                    ...section,
                    columns,
                    columnFields,
                };
            })
            .filter((section) => section.columnFields.some((column: CompanionField[]) => column.length > 0));
    }, [customFields, fieldById, layoutConfig, systemFieldApiNames]);

    const formatValue = (value: unknown) => {
        if (value === null || value === undefined || value === "") {
            return <span className="text-muted-foreground">Not set</span>;
        }
        if (typeof value === "boolean") {
            return value ? "Yes" : "No";
        }
        if (Array.isArray(value)) {
            return value.length ? value.join(", ") : <span className="text-muted-foreground">Not set</span>;
        }
        return String(value);
    };

    const renderFieldValue = (field: any, value: any) => {
        if (value === null || value === undefined || value === "") {
            return <span className="text-muted-foreground">Not set</span>;
        }

        switch (field.type) {
            case "File": {
                const attachment = value;
                if (!attachment || typeof attachment !== "object") {
                    return <span className="text-muted-foreground">Not set</span>;
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
                            className="max-h-40 rounded border border-slate-200"
                        />
                    );
                }

                return (
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {attachment.displayName || attachment.filename || "Download"}
                    </a>
                );
            }
            case "Lookup": {
                const lookup = lookupResolutions[field.apiName];
                return lookup ? lookup.name : formatValue(value);
            }
            case "Url":
                return (
                    <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {String(value)}
                    </a>
                );
            case "Email":
                return (
                    <a href={`mailto:${String(value)}`} className="text-primary hover:underline">
                        {String(value)}
                    </a>
                );
            case "Checkbox":
                return value === true || value === "true" ? "Yes" : "No";
            case "Date":
                return <span suppressHydrationWarning>{formatDateOnlyForDisplay(value) ?? String(value)}</span>;
            case "DateTime":
                return <span suppressHydrationWarning>{formatDateTimeForDisplay(value) ?? String(value)}</span>;
            case "Picklist": {
                const options = Array.isArray(field.picklistOptions) ? field.picklistOptions : [];
                const match = options.find((opt: any) => String(opt.id) === String(value));
                return match ? `${match.label}${match.isActive === false ? " (inactive)" : ""}` : formatValue(value);
            }
            case "TextArea":
                return <span className="whitespace-pre-wrap">{String(value)}</span>;
            default:
                return formatValue(value);
        }
    };

    if (!isEditing) {
        return (
            <div className="space-y-6">
                <div className="flex items-start justify-end gap-4">
                    <Button type="button" onClick={() => setIsEditing(true)} className="gap-2">
                        <Pencil className="h-4 w-4" />
                        Edit Profile
                    </Button>
                </div>

                <div className="space-y-6">
                    <div className="rounded-lg border border-border/60 bg-card/50 p-4">
                        <div className="mb-4 border-b border-border/60 bg-slate-50/70 px-4 py-3 -mx-4 -mt-4">
                            <h4 className="text-sm font-semibold">System Fields</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</div>
                                <div className="mt-1">{formatValue(user.name)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">UserId</div>
                                <div className="mt-1">{formatValue(flattenedCompanionRecord[USER_ID_FIELD_API_NAME])}</div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</div>
                                <div className="mt-1">{formatValue(user.username)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</div>
                                <div className="mt-1">{formatValue(user.email)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</div>
                                <div className="mt-1">{user.userType === "admin" ? "Administrator" : "Standard User"}</div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Group</div>
                                <div className="mt-1">
                                    {formatValue(groups.find((group) => group.id === user.groupId)?.name ?? null)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {detailSections.length > 0 ? (
                        detailSections.map((section) => {
                            const gridCols =
                                section.columns === 1
                                    ? "md:grid-cols-1"
                                    : section.columns === 2
                                        ? "md:grid-cols-2"
                                        : "md:grid-cols-3";

                            return (
                                <div key={section.id} className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
                                    <div className="border-b border-border/60 bg-slate-50/70 px-4 py-3">
                                        <h4 className="text-sm font-semibold">{section.title}</h4>
                                    </div>
                                    <div className="p-4">
                                        <div className={`grid grid-cols-1 gap-x-8 gap-y-6 ${gridCols}`}>
                                            {section.columnFields.map((columnFields: any[], colIndex: number) => (
                                                <dl key={`${section.id}-${colIndex}`} className="space-y-5">
                                                    {columnFields.map((field: any) => (
                                                        <div key={field.id}>
                                                            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                {field.label}
                                                            </dt>
                                                            <dd className="mt-1 text-sm text-foreground">
                                                                {renderFieldValue(field, flattenedCompanionRecord[field.apiName])}
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
                    ) : (
                        <div className="rounded-lg border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
                            No companion fields available.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <RecordForm
            objectDef={companionRecord.objectDef}
            record={flattenedCompanionRecord}
            appApiName="admin"
            blockedFieldApiNames={["name", USER_ID_FIELD_API_NAME]}
            submitMode="adminUserRecord"
            extraSchemaShape={accountSchemaShape}
            extraDefaultValues={{
                accountName: user.name ?? "",
                accountUsername: user.username,
                accountEmail: user.email ?? "",
                accountUserType: user.userType,
                accountGroupId: user.groupId ? String(user.groupId) : "none",
            }}
            submitLabel="Save Profile"
            submitOverride={async (values) => {
                const {
                    accountName,
                    accountUsername,
                    accountEmail,
                    accountUserType,
                    accountGroupId,
                    ...recordData
                } = values;

                return updateManagedUserProfile(user.id, {
                    account: {
                        name: accountName,
                        username: accountUsername,
                        email: accountEmail || null,
                        userType: accountUserType,
                        groupId: accountGroupId === "none" ? null : parseInt(accountGroupId, 10),
                    },
                    recordData,
                });
            }}
            onSuccess={() => setIsEditing(false)}
            renderExtraFields={({ form, isLoading }) => (
                <div className="md:col-span-2 rounded-lg border border-border/60 bg-card/50 p-4">
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold">Account</h3>
                        <p className="text-sm text-muted-foreground">
                            Core account identity, role, and group membership save together with companion user fields.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="accountName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="accountUsername"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Username</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="accountEmail"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input {...field} value={field.value ?? ""} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="accountUserType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Role</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard User</SelectItem>
                                            <SelectItem value="admin">Administrator</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="accountGroupId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Group</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="No group" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        <SelectItem value="none">No group</SelectItem>
                                        {groups.map((group) => (
                                            <SelectItem key={group.id} value={String(group.id)}>
                                                    {group.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>
            )}
        />
    );
}
