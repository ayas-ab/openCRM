"use client";

import { useEffect, useState } from "react";
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
import { createFieldDefinition } from "@/actions/admin/admin-actions";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { normalizePicklistApiName } from "@/lib/api-names";

const fieldTypes = [
    { value: "Text", label: "Text" },
    { value: "AutoNumber", label: "Auto Number" },
    { value: "TextArea", label: "Text Area" },
    { value: "Number", label: "Number" },
    { value: "Date", label: "Date" },
    { value: "DateTime", label: "Date & Time" },
    { value: "Checkbox", label: "Checkbox" },
    { value: "Phone", label: "Phone" },
    { value: "Email", label: "Email" },
    { value: "Url", label: "URL" },
    { value: "Picklist", label: "Picklist" },
    { value: "Lookup", label: "Lookup" },
    { value: "File", label: "File" },
] as const;

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
        label: z.string().min(1, "Label is required"),
        type: z.enum(["Text", "AutoNumber", "TextArea", "Number", "Date", "DateTime", "Checkbox", "Phone", "Email", "Url", "Picklist", "Lookup", "File"]),
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

interface CreateFieldDialogProps {
    objectDefId: number;
    availableObjects: { id: number; label: string }[];
}

export function CreateFieldDialog({ objectDefId, availableObjects }: CreateFieldDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            label: "",
            type: "Text",
            required: false,
            isExternalId: false,
            isUnique: false,
            picklistOptions: [],
            lookupTargetId: "",
            decimalPlaces: "",
            fileType: "all",
            displayMode: "link",
            autoNumberPrefix: "",
            autoNumberMinDigits: "4",
            autoNumberStartValue: "1",
        },
    });

    const {
        fields: picklistOptions,
        append: appendPicklistOption,
        remove: removePicklistOption,
    } = useFieldArray({
        control: form.control,
        name: "picklistOptions",
        keyName: "fieldId",
    });

    const selectedType = form.watch("type");
    const canBeExternalId = selectedType === "Text";
    const canBeUnique = ["Text", "Email", "Phone"].includes(selectedType);
    const selectedFileType = form.watch("fileType");
    const autoPrefix = form.watch("autoNumberPrefix") ?? "";
    const autoMinDigits = form.watch("autoNumberMinDigits") ?? "";
    const autoStartValue = form.watch("autoNumberStartValue") ?? "";
    const isExternalId = form.watch("isExternalId");
    const isUnique = form.watch("isUnique");

    useEffect(() => {
        if (selectedType !== "Picklist") {
            form.setValue("picklistOptions", []);
        } else if (picklistOptions.length === 0) {
            appendPicklistOption({ label: "", apiName: "", isActive: true, sortOrder: picklistOptions.length });
        }

        if (!canBeExternalId) {
            form.setValue("isExternalId", false);
        }
        if (!canBeUnique) {
            form.setValue("isUnique", false);
        }
        if (selectedType === "AutoNumber") {
            form.setValue("required", false);
            form.setValue("isExternalId", false);
            form.setValue("isUnique", false);
        }
        if (form.getValues("isExternalId")) {
            form.setValue("isUnique", false);
        }
        if (form.getValues("isUnique")) {
            form.setValue("isExternalId", false);
        }
        if (selectedType !== "AutoNumber") {
            form.setValue("autoNumberPrefix", "");
            form.setValue("autoNumberMinDigits", "");
            form.setValue("autoNumberStartValue", "");
        } else {
            if (!form.getValues("autoNumberMinDigits")) {
                form.setValue("autoNumberMinDigits", "4");
            }
            if (!form.getValues("autoNumberStartValue")) {
                form.setValue("autoNumberStartValue", "1");
            }
        }
    }, [selectedType, canBeExternalId, canBeUnique, form, picklistOptions.length, appendPicklistOption, isExternalId, isUnique]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const lookupTargetId = values.lookupTargetId?.trim() || undefined;
            const decimalPlaces = values.decimalPlaces ? Number(values.decimalPlaces) : undefined;
            const autoNumberMinDigits = values.autoNumberMinDigits ? Number(values.autoNumberMinDigits) : undefined;
            const autoNumberStartValue = values.autoNumberStartValue ? Number(values.autoNumberStartValue) : undefined;

            const result = await createFieldDefinition({
                ...values,
                objectDefId,
                lookupTargetId,
                decimalPlaces,
                autoNumberMinDigits,
                autoNumberStartValue,
            });

            if (result.success) {
                toast.success("Field created successfully");
                setOpen(false);
                form.reset();
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
                <Button className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New Field
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] overflow-hidden p-0">
                <div className="flex h-full flex-col bg-white">
                    <DialogHeader className="border-b border-border/50 bg-slate-50 px-6 py-4">
                        <DialogTitle className="text-lg">Create New Field</DialogTitle>
                        <DialogDescription>
                            Define the field details and settings.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
                            <ScrollArea className="max-h-[70vh] bg-white">
                                <div className="px-6 py-5 space-y-5">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Field Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm bg-white">
                                                <SelectValue placeholder="Select a field type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {fieldTypes.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="label"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Status" {...field} className="shadow-sm bg-white" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {selectedType === "Picklist" && (
                            <div className="space-y-3 rounded-md border border-border/50 p-4 bg-muted/10">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Picklist Options
                                        </FormLabel>
                                        <p className="text-xs text-muted-foreground">Define labels and API names for each option.</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            appendPicklistOption({ label: "", apiName: "", isActive: true, sortOrder: picklistOptions.length })
                                        }
                                    >
                                        Add option
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {picklistOptions.map((option, index) => (
                                        <div
                                            key={option.fieldId}
                                            className="grid gap-2 md:grid-cols-[1.2fr_1.1fr_0.6fr_auto] items-center"
                                        >
                                            <FormField
                                                control={form.control}
                                                name={`picklistOptions.${index}.label`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                placeholder="Label"
                                                                className="shadow-sm bg-white"
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
                                                                className="shadow-sm bg-white font-mono text-xs"
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
                                                                className="shadow-sm bg-white text-xs"
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
                                                    onClick={() => removePicklistOption(index)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <FormDescription className="text-xs">
                                    API Name is the stable internal value used for filters and integrations.
                                </FormDescription>
                            </div>
                        )}

                        {selectedType === "Number" && (
                            <FormField
                                control={form.control}
                                name="decimalPlaces"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decimal Places</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="e.g. 0 or 2"
                                                type="number"
                                                min={0}
                                                {...field}
                                                className="shadow-sm bg-white"
                                            />
                                        </FormControl>
                                        <FormDescription className="text-xs">Leave blank for default precision.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {selectedType === "AutoNumber" && (
                            <div className="space-y-4 rounded-md border border-border/50 p-4 bg-muted/10">
                                <FormField
                                    control={form.control}
                                    name="autoNumberPrefix"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prefix</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g. TKT-"
                                                    {...field}
                                                    className="shadow-sm bg-white"
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
                                <div className="grid gap-4 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="autoNumberMinDigits"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minimum Digits</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g. 4"
                                                        type="number"
                                                        min={1}
                                                        max={10}
                                                        {...field}
                                                        className="shadow-sm bg-white"
                                                    />
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
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starting Number</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g. 1"
                                                        type="number"
                                                        min={1}
                                                        max={9999999}
                                                        {...field}
                                                        className="shadow-sm bg-white"
                                                    />
                                                </FormControl>
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

                        {selectedType === "Lookup" && (
                            <FormField
                                control={form.control}
                                name="lookupTargetId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Related Object</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="shadow-sm bg-white">
                                                    <SelectValue placeholder="Select an object" />
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
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {selectedType === "File" && (
                            <div className="space-y-4 rounded-md border border-border/50 p-4 bg-muted/10">
                                <FormField
                                    control={form.control}
                                    name="fileType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allowed File Type</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="shadow-sm bg-white">
                                                        <SelectValue placeholder="Select file type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="images">Images only</SelectItem>
                                                    <SelectItem value="pdf">PDF only</SelectItem>
                                                    <SelectItem value="docx">DOCX only</SelectItem>
                                                    <SelectItem value="all">Images + PDF + DOCX</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {selectedFileType === "images" && (
                                    <FormField
                                        control={form.control}
                                        name="displayMode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image Display</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="shadow-sm bg-white">
                                                            <SelectValue placeholder="Select display mode" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="inline">Inline preview</SelectItem>
                                                        <SelectItem value="link">Download link</SelectItem>
                                                    </SelectContent>
                                                </Select>
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
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/60 p-4 shadow-sm bg-muted/10">
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
                                        <div className="space-y-0.5 leading-none">
                                            <FormLabel className="font-semibold text-foreground">External ID</FormLabel>
                                            <FormDescription className="text-xs">
                                                Unique identifier used for bulk import/update.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                        {canBeUnique && selectedType !== "AutoNumber" && (
                            <FormField
                                control={form.control}
                                name="isUnique"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/60 p-4 shadow-sm bg-muted/10">
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
                                        <div className="space-y-0.5 leading-none">
                                            <FormLabel className="font-semibold text-foreground">Unique</FormLabel>
                                            <FormDescription className="text-xs">
                                                Prevent duplicate values for this field.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                        {selectedType !== "AutoNumber" && (
                            <FormField
                                control={form.control}
                                name="required"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/60 p-4 shadow-sm bg-muted/10">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <div className="space-y-0.5 leading-none">
                                            <FormLabel className="font-semibold text-foreground">
                                                Required Field
                                            </FormLabel>
                                            <FormDescription className="text-xs">
                                                Users must enter a value for this field.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}

                                </div>
                            </ScrollArea>
                            <DialogFooter className="justify-end border-t border-border/50 bg-slate-50 px-6 py-4">
                                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">
                                    Cancel
                                </Button>
                                <Button type="submit" className="shadow-sm">
                                    Create Field
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
