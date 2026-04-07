"use client";

import { useState, useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { updateFieldDefinition } from "@/actions/admin/admin-actions";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { normalizePicklistApiName } from "@/lib/api-names";

const picklistOptionSchema = z.object({
    id: z.number().optional(),
    label: z.string().min(1, "Option label is required"),
    apiName: z.string().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().default(true),
});

function getAutoNumberPreview(prefix: string, minDigits: string, startValue: string) {
    const safePrefix = prefix ?? "";
    const digits = Number.isFinite(Number(minDigits))
        ? Math.min(10, Math.max(1, Math.floor(Number(minDigits))))
        : 4;
    const start = Number.isFinite(Number(startValue)) ? Math.max(1, Math.floor(Number(startValue))) : 1;
    const padded = digits > 0 ? String(start).padStart(digits, "0") : String(start);
    return `${safePrefix}${padded}`;
}

const formSchema = z
    .object({
        objectDefId: z.number(),
        label: z.string().min(1, "Label is required"),
        type: z.enum(["Text", "AutoNumber", "TextArea", "Number", "Date", "DateTime", "Checkbox", "Phone", "Email", "Url", "Lookup", "Picklist", "File"]),
        required: z.boolean().default(false),
        isExternalId: z.boolean().default(false),
        isUnique: z.boolean().default(false),
        picklistOptions: z.array(picklistOptionSchema).optional(),
        lookupTargetId: z.string().optional(),
        decimalPlaces: z.string().optional(),
        fileType: z.enum(["images", "pdf", "docx", "all"]).optional(),
        displayMode: z.enum(["inline", "link"]).optional(),
        autoNumberPrefix: z.string().optional(),
        autoNumberMinDigits: z.string().optional(),
        autoNumberStartValue: z.string().optional(),
    })
    .superRefine((values, ctx) => {
        if (values.type === "AutoNumber" && !values.autoNumberPrefix?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["autoNumberPrefix"],
                message: "Prefix is required for auto number.",
            });
        }
    });

interface EditFieldDialogProps {
    field: {
        id: number;
        objectDefId: number;
        label: string;
        apiName: string;
        type: string;
        required: boolean;
        isExternalId?: boolean;
        isUnique?: boolean;
        options: any;
        lookupTargetId: number | null;
        picklistOptions?: Array<{
            id: number;
            apiName: string;
            label: string;
            isActive: boolean;
            sortOrder: number | null;
        }>;
    };
    availableObjects: { id: number; label: string }[];
}

export function EditFieldDialog({ field, availableObjects }: EditFieldDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const isNameField = field.apiName === "name";

    const optionsObject = field.options && !Array.isArray(field.options) ? field.options : {};
    const autoNumberOptions = optionsObject?.autoNumber ?? {};
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            objectDefId: field.objectDefId,
            label: field.label,
            type: field.type as any,
            required: field.required,
            isExternalId: (field as any).isExternalId ?? false,
            isUnique: (field as any).isUnique ?? false,
            picklistOptions: (field.picklistOptions || []).map((option) => ({
                id: option.id,
                apiName: option.apiName,
                label: option.label,
                isActive: option.isActive ?? true,
                sortOrder: option.sortOrder ?? 0,
            })),
            lookupTargetId: field.lookupTargetId ? String(field.lookupTargetId) : undefined,
            decimalPlaces: optionsObject?.decimalPlaces ? String(optionsObject.decimalPlaces) : "",
            fileType: optionsObject?.allowedTypes ?? "all",
            displayMode: optionsObject?.displayMode ?? "link",
            autoNumberPrefix: autoNumberOptions?.prefix ?? "",
            autoNumberMinDigits: Number.isFinite(autoNumberOptions?.minDigits) ? String(autoNumberOptions.minDigits) : "",
            autoNumberStartValue: Number.isFinite(autoNumberOptions?.nextValue) ? String(autoNumberOptions.nextValue) : "",
        },
    });

    const picklistFieldArray = useFieldArray({
        control: form.control,
        name: "picklistOptions",
        keyName: "fieldId",
    });

    const watchType = form.watch("type");
    const canBeExternalId = watchType === "Text";
    const canBeUnique = ["Text", "Email", "Phone"].includes(watchType);
    const watchFileType = form.watch("fileType");
    const autoPrefix = form.watch("autoNumberPrefix") ?? "";
    const autoMinDigits = form.watch("autoNumberMinDigits") ?? "";
    const autoStartValue = form.watch("autoNumberStartValue") ?? "";
    const isExternalId = form.watch("isExternalId");
    const isUnique = form.watch("isUnique");

    useEffect(() => {
        if (!canBeExternalId) {
            form.setValue("isExternalId", false);
        }
        if (!canBeUnique) {
            form.setValue("isUnique", false);
        }
        if (isExternalId) {
            form.setValue("isUnique", false);
        }
        if (isUnique) {
            form.setValue("isExternalId", false);
        }
        if (watchType === "AutoNumber") {
            form.setValue("required", false);
            form.setValue("isExternalId", false);
            form.setValue("isUnique", false);
        }
    }, [canBeExternalId, canBeUnique, form, isExternalId, isUnique, watchType]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const lookupTargetId = values.lookupTargetId?.trim() || undefined;
            const decimalPlaces = values.decimalPlaces ? Number(values.decimalPlaces) : undefined;
            const autoNumberMinDigits = values.autoNumberMinDigits ? Number(values.autoNumberMinDigits) : undefined;
            const autoNumberStartValue = values.autoNumberStartValue ? Number(values.autoNumberStartValue) : undefined;
            const result = await updateFieldDefinition(field.id, {
                ...values,
                lookupTargetId,
                decimalPlaces,
                autoNumberMinDigits,
                autoNumberStartValue,
            });

            if (result.success) {
                toast.success("Field updated successfully");
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] overflow-hidden p-0">
                <div className="flex h-full flex-col bg-white">
                    <DialogHeader className="border-b border-border/50 bg-slate-50 px-6 py-4">
                        <DialogTitle className="text-lg">Edit Field: {field.label}</DialogTitle>
                        <DialogDescription>
                            Modify field properties. Type cannot be changed to prevent data loss.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
                            <ScrollArea className="max-h-[70vh] bg-white">
                                <div className="px-6 py-5 space-y-4">
                        <FormField
                            control={form.control}
                            name="label"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Label</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. First Name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Text">Text</SelectItem>
                                            <SelectItem value="AutoNumber">Auto Number</SelectItem>
                                            <SelectItem value="TextArea">Text Area</SelectItem>
                                            <SelectItem value="Number">Number</SelectItem>
                                            <SelectItem value="Date">Date</SelectItem>
                                            <SelectItem value="DateTime">Date & Time</SelectItem>
                                            <SelectItem value="Checkbox">Checkbox</SelectItem>
                                            <SelectItem value="Phone">Phone</SelectItem>
                                            <SelectItem value="Email">Email</SelectItem>
                                            <SelectItem value="Url">URL</SelectItem>
                                            <SelectItem value="Lookup">Lookup</SelectItem>
                                            <SelectItem value="Picklist">Picklist</SelectItem>
                                            <SelectItem value="File">File</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>Type cannot be changed after creation.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {watchType === "Picklist" && (
                            <div className="space-y-3 rounded-md border border-border/50 p-4 bg-muted/10">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <FormLabel className="text-sm font-semibold">Picklist Options</FormLabel>
                                        <p className="text-xs text-muted-foreground">
                                            Update labels without rewriting existing records.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            picklistFieldArray.append({
                                                label: "",
                                                apiName: "",
                                                isActive: true,
                                                sortOrder: picklistFieldArray.fields.length,
                                            })
                                        }
                                    >
                                        Add option
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {picklistFieldArray.fields.map((option, index) => (
                                        <div
                                            key={option.fieldId}
                                            className="grid gap-2 md:grid-cols-[1.2fr_1.1fr_0.6fr_auto] items-center"
                                        >
                                            <input
                                                type="hidden"
                                                {...form.register(`picklistOptions.${index}.id`, { valueAsNumber: true })}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`picklistOptions.${index}.label`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                placeholder="Label"
                                                                onChange={(event) => {
                                                                    field.onChange(event);
                                                                    const nextValue = event.target.value;
                                                                    const currentApi = form.getValues(`picklistOptions.${index}.apiName`);
                                                                    if (!currentApi) {
                                                                        form.setValue(
                                                                            `picklistOptions.${index}.apiName`,
                                                                            normalizePicklistApiName(nextValue)
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name={`picklistOptions.${index}.apiName`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                placeholder="api_name"
                                                                className="font-mono text-xs"
                                                                onBlur={(event) => {
                                                                    const normalized = normalizePicklistApiName(event.target.value);
                                                                    form.setValue(`picklistOptions.${index}.apiName`, normalized);
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name={`picklistOptions.${index}.sortOrder`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                type="number"
                                                                min={0}
                                                                placeholder={`${index}`}
                                                                className="text-xs"
                                                                onChange={(event) =>
                                                                    field.onChange(
                                                                        event.target.value === ""
                                                                            ? undefined
                                                                            : Number(event.target.value)
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <div className="flex items-center gap-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`picklistOptions.${index}.isActive`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex items-center gap-2">
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value}
                                                                    onCheckedChange={field.onChange}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="text-xs text-muted-foreground">Active</FormLabel>
                                                        </FormItem>
                                                    )}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => picklistFieldArray.remove(index)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <FormDescription className="text-xs text-amber-700">
                                    Warning: Changing picklist values can affect filters and assignments that rely on these values.
                                </FormDescription>
                            </div>
                        )}

                        {watchType === "Number" && (
                            <FormField
                                control={form.control}
                                name="decimalPlaces"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Decimal Places</FormLabel>
                                        <FormControl>
                                            <Input type="number" min={0} placeholder="e.g. 0 or 2" {...field} />
                                        </FormControl>
                                        <FormDescription className="text-xs text-muted-foreground">
                                            Leave blank for default precision.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {watchType === "AutoNumber" && (
                            <div className="space-y-3 rounded-md border border-border/50 p-4 bg-muted/10">
                                <FormField
                                    control={form.control}
                                    name="autoNumberPrefix"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Prefix</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g. TKT-"
                                                    {...field}
                                                    onBlur={(event) => {
                                                        const cleaned = event.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
                                                        form.setValue("autoNumberPrefix", cleaned);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid gap-3 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="autoNumberMinDigits"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Minimum Digits</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={1} max={10} placeholder="e.g. 4" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="autoNumberStartValue"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Next Number</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={1} {...field} disabled />
                                                </FormControl>
                                                <FormDescription className="text-xs text-muted-foreground">
                                                    Next value used for new records.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="rounded-md border border-dashed border-border/60 bg-white px-3 py-2 text-xs text-muted-foreground">
                                    Sample:{" "}
                                    <span className="font-mono text-foreground">
                                        {getAutoNumberPreview(autoPrefix, autoMinDigits, autoStartValue)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Prefix allows letters, numbers, <span className="font-mono">_</span> and <span className="font-mono">-</span>. Min digits must be 1–10.
                                </p>
                            </div>
                        )}

                        {watchType === "Lookup" && (
                            <FormField
                                control={form.control}
                                name="lookupTargetId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Target Object</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select object" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {availableObjects.map((obj) => (
                                                    <SelectItem key={obj.id} value={String(obj.id)}>
                                                        {obj.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription className="text-xs text-muted-foreground">
                                            Lookup targets are locked after creation.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {watchType === "File" && (
                            <div className="space-y-3 rounded-md border p-3">
                                <FormField
                                    control={form.control}
                                    name="fileType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Allowed File Type</FormLabel>
                                            <FormControl>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select file type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="images">Images only</SelectItem>
                                                        <SelectItem value="pdf">PDF only</SelectItem>
                                                        <SelectItem value="docx">DOCX only</SelectItem>
                                                        <SelectItem value="all">Images + PDF + DOCX</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {watchFileType === "images" && (
                                    <FormField
                                        control={form.control}
                                        name="displayMode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Image Display</FormLabel>
                                                <FormControl>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select display mode" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="inline">Inline preview</SelectItem>
                                                            <SelectItem value="link">Download link</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        )}

                        {canBeExternalId && (
                            <FormField
                                control={form.control}
                                name="isExternalId"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) => {
                                                    field.onChange(checked);
                                                    if (checked) {
                                                        form.setValue("isUnique", false);
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>External ID</FormLabel>
                                            <FormDescription>
                                                Unique identifier used for bulk import/update.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                        {canBeUnique && watchType !== "AutoNumber" && (
                            <FormField
                                control={form.control}
                                name="isUnique"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) => {
                                                    field.onChange(checked);
                                                    if (checked) {
                                                        form.setValue("isExternalId", false);
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>Unique</FormLabel>
                                            <FormDescription>
                                                Prevent duplicate values for this field.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                        {watchType !== "AutoNumber" && (
                            <FormField
                                control={form.control}
                                name="required"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={isNameField}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>
                                                Required Field
                                            </FormLabel>
                                            <FormDescription>
                                                {isNameField
                                                    ? "The Name field is always required."
                                                    : "Users must enter a value for this field."}
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                                </div>
                            </ScrollArea>
                            <DialogFooter className="border-t border-border/50 bg-slate-50 px-6 py-4">
                                <Button type="submit">Save Changes</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
