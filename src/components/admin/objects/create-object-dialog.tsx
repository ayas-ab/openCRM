"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { toast } from "sonner";
import { createObjectDefinition } from "@/actions/admin/admin-actions";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { IconPicker } from "./icon-picker";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

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
        pluralLabel: z.string().min(1, "Plural Label is required"),
        description: z.string().optional(),
        icon: z.string().optional(),
        nameFieldType: z.enum(["Text", "AutoNumber"]).default("Text"),
        autoNumberPrefix: z.string().optional(),
        autoNumberMinDigits: z
            .string()
            .optional()
            .refine((value) => {
                if (!value) return true;
                const parsed = Number(value);
                return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10;
            }, "Minimum digits must be between 1 and 10."),
        autoNumberStartValue: z
            .string()
            .optional()
            .refine((value) => {
                if (!value) return true;
                const parsed = Number(value);
                return Number.isFinite(parsed) && parsed >= 1 && parsed <= 1_000_000_000;
            }, "Starting number must be between 1 and 1,000,000,000."),
    })
    .superRefine((values, ctx) => {
        if (values.nameFieldType === "AutoNumber" && !values.autoNumberPrefix?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["autoNumberPrefix"],
                message: "Prefix is required for auto number.",
            });
        }
    });

export function CreateObjectDialog() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            label: "",
            pluralLabel: "",
            description: "",
            icon: "box", // Default icon
            nameFieldType: "Text",
            autoNumberPrefix: "",
            autoNumberMinDigits: "4",
            autoNumberStartValue: "1",
        },
    });
    const watchNameFieldType = form.watch("nameFieldType");
    const autoPrefix = form.watch("autoNumberPrefix");
    const autoMinDigits = form.watch("autoNumberMinDigits");
    const autoStartValue = form.watch("autoNumberStartValue");

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const autoNumberMinDigits = values.autoNumberMinDigits ? Number(values.autoNumberMinDigits) : undefined;
            const autoNumberStartValue = values.autoNumberStartValue ? Number(values.autoNumberStartValue) : undefined;
            const result = await createObjectDefinition({
                ...values,
                autoNumberMinDigits,
                autoNumberStartValue,
            });
            if (result.success) {
                toast.success("Object created successfully");
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
                    New Object
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
                <DialogHeader className="border-b border-border/40 pb-4 mb-4">
                    <DialogTitle className="text-xl font-semibold">Create Custom Object</DialogTitle>
                    <DialogDescription>
                        Define a new business entity for your organization.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="label"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label (Singular)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Vehicle" {...field} className="shadow-sm bg-white" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="pluralLabel"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plural Label</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Vehicles" {...field} className="shadow-sm bg-white" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Describe the purpose of this object..." {...field} className="min-h-[80px] shadow-sm resize-none bg-white" />
                                        </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid gap-6 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="nameFieldType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Name Field Type
                                        </FormLabel>
                                        <FormControl>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <SelectTrigger className="shadow-sm bg-white">
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Text">Text</SelectItem>
                                                    <SelectItem value="AutoNumber">Auto Number</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {watchNameFieldType === "AutoNumber" && (
                                <FormField
                                    control={form.control}
                                    name="autoNumberPrefix"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Auto Number Prefix
                                            </FormLabel>
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
                            )}
                        </div>
                        {watchNameFieldType === "AutoNumber" && (
                            <div className="grid gap-6 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="autoNumberMinDigits"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Minimum Digits
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={10}
                                                    placeholder="e.g. 4"
                                                    {...field}
                                                    className="shadow-sm bg-white"
                                                    onBlur={(event) => {
                                                        const parsed = Math.min(10, Math.max(1, Math.floor(Number(event.target.value) || 0)));
                                                        const safeValue = parsed ? String(parsed) : "4";
                                                        form.setValue("autoNumberMinDigits", safeValue, { shouldValidate: true });
                                                    }}
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
                                            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                Starting Number
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={1000000000}
                                                    placeholder="e.g. 1"
                                                    {...field}
                                                    className="shadow-sm bg-white"
                                                    onBlur={(event) => {
                                                        const parsed = Math.floor(Number(event.target.value) || 0);
                                                        const capped = Math.min(1_000_000_000, Math.max(1, parsed));
                                                        form.setValue("autoNumberStartValue", String(capped), { shouldValidate: true });
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}
                        {watchNameFieldType === "AutoNumber" && (
                            <div className="rounded-md border bg-white px-3 py-2 text-xs text-muted-foreground">
                                Preview:{" "}
                                <span className="font-mono text-foreground">
                                    {getAutoNumberPreview(autoPrefix || "", autoMinDigits || "4", autoStartValue || "1")}
                                </span>
                            </div>
                        )}
                        <FormField
                            control={form.control}
                            name="icon"
                            render={({ field }) => {
                                const SelectedIcon =
                                    (field.value && (LucideIcons as any)[field.value]) || LucideIcons.Box;
                                return (
                                    <FormItem>
                                        <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Icon
                                        </FormLabel>
                                        <FormControl>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className={cn("w-full justify-between gap-3 h-12", !field.value && "text-muted-foreground")}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <SelectedIcon className="h-5 w-5 text-primary" />
                                                            <span className="text-sm">{field.value || "Select an icon"}</span>
                                                        </div>
                                                        <Plus className="h-4 w-4 opacity-60" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[420px] p-4" align="start">
                                                    <IconPicker value={field.value} onChange={field.onChange} />
                                                </PopoverContent>
                                            </Popover>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                );
                            }}
                        />
                        <DialogFooter className="justify-end border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
                            <Button type="submit" className="shadow-sm">Create Object</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
