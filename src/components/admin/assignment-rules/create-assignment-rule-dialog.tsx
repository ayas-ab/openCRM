"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { createAssignmentRule } from "@/actions/admin/assignment-rule-actions";
import { formatDateOnlyForInput, formatDateTimeForInput } from "@/lib/temporal";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type ObjectOption = {
    id: number;
    label: string;
    apiName: string;
};

type SimpleOption = {
    id: number;
    label: string;
};

type FieldOption = {
    id: number;
    label: string;
    apiName: string;
    type: string;
    picklistOptions?: Array<{ id: number; label: string; isActive: boolean }>;
};

type FilterState = {
    id: string;
    fieldDefId: number | null;
    operator: string;
    value: string;
};

const formSchema = z.object({
    objectDefId: z.string().min(1, "Object is required"),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    targetType: z.enum(["USER", "QUEUE"]),
    targetUserId: z.string().optional(),
    targetQueueId: z.string().optional(),
});

const OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "gt", label: "Greater Than" },
    { value: "gte", label: "Greater Or Equal" },
    { value: "lt", label: "Less Than" },
    { value: "lte", label: "Less Or Equal" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does Not Contain" },
    { value: "is_blank", label: "Is Blank" },
    { value: "is_not_blank", label: "Is Not Blank" },
];

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

function getOperatorOptions(fieldType: string | undefined) {
    if (!fieldType) return OPERATORS;
    if (fieldType === "Picklist") {
        return OPERATORS.filter((op) => ["equals", "not_equals", "is_blank", "is_not_blank"].includes(op.value));
    }
    if (fieldType === "Lookup") {
        return OPERATORS.filter((op) => ["is_blank", "is_not_blank"].includes(op.value));
    }
    if (["Number"].includes(fieldType)) {
        return OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    if (fieldType === "Date" || fieldType === "DateTime") {
        return OPERATORS.filter((op) => !["contains", "not_contains"].includes(op.value));
    }
    return OPERATORS.filter((op) => !["gt", "gte", "lt", "lte"].includes(op.value));
}

function getValueInputType(fieldType?: string) {
    if (fieldType === "Date") return "date";
    if (fieldType === "DateTime") return "datetime-local";
    return "text";
}

function getValueInputValue(fieldType: string | undefined, value: string) {
    if (fieldType === "Date") return formatDateOnlyForInput(value);
    if (fieldType === "DateTime") return formatDateTimeForInput(value);
    return value;
}

export function CreateAssignmentRuleDialog({
    objects,
    users,
    queues,
    fixedObject,
    fields: initialFields = [],
}: {
    objects: ObjectOption[];
    users: SimpleOption[];
    queues: SimpleOption[];
    fixedObject?: ObjectOption;
    fields?: FieldOption[];
}) {
    const [open, setOpen] = useState(false);
    const [isActive, setIsActive] = useState(true);
    const [filters, setFilters] = useState<FilterState[]>([]);
    const [logic, setLogic] = useState<"ALL" | "ANY">("ALL");
    const [fields, setFields] = useState<FieldOption[]>(initialFields);
    const [loadingFields, setLoadingFields] = useState(false);
    const router = useRouter();

    const criteriaFields = useMemo(
        () => fields.filter((field) => !["TextArea", "File"].includes(field.type)),
        [fields]
    );

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            objectDefId: fixedObject ? String(fixedObject.id) : "",
            name: "",
            description: "",
            targetType: "USER",
            targetUserId: "",
            targetQueueId: "",
        },
    });

    const selectedObjectDefId = form.watch("objectDefId");
    const targetType = form.watch("targetType");

    useEffect(() => {
        if (fixedObject) {
            form.setValue("objectDefId", String(fixedObject.id));
        }
    }, [fixedObject, form]);

    useEffect(() => {
        setFields(initialFields);
    }, [initialFields]);

    useEffect(() => {
        if (fixedObject && initialFields.length > 0) {
            setFields(initialFields);
            setLoadingFields(false);
            return;
        }

        if (!selectedObjectDefId) {
            setFields([]);
            return;
        }

        const selected = objects.find((obj) => obj.id === Number(selectedObjectDefId));
        if (!selected?.apiName) return;

        const fetchFields = async () => {
            setLoadingFields(true);
            try {
                const response = await fetch(`/api/fields/${selected.apiName}`);
                if (response.ok) {
                    const payload = await response.json();
                    setFields(payload.fields || []);
                } else {
                    setFields([]);
                }
            } catch {
                setFields([]);
            } finally {
                setLoadingFields(false);
            }
        };

        fetchFields();
    }, [selectedObjectDefId, objects, fixedObject, initialFields]);

    const fieldMap = useMemo(() => new Map(criteriaFields.map((field) => [field.id, field])), [criteriaFields]);

    const addFilter = () => {
        setFilters((prev) => [
            ...prev,
            {
                id: generateId(),
                fieldDefId: criteriaFields[0]?.id ?? null,
                operator: "equals",
                value: "",
            },
        ]);
    };

    const updateFilter = (id: string, updates: Partial<FilterState>) => {
        setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, ...updates } : filter)));
    };

    const removeFilter = (id: string) => {
        setFilters((prev) => prev.filter((filter) => filter.id !== id));
    };

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const objectDefId = parseInt(values.objectDefId, 10);
        if (Number.isNaN(objectDefId)) {
            toast.error("Select an object.");
            return;
        }

        const targetUserId = values.targetType === "USER" ? parseInt(values.targetUserId || "", 10) : null;
        const targetQueueId = values.targetType === "QUEUE" ? parseInt(values.targetQueueId || "", 10) : null;

        if (values.targetType === "USER" && (!targetUserId || Number.isNaN(targetUserId))) {
            toast.error("Select a target user.");
            return;
        }
        if (values.targetType === "QUEUE" && (!targetQueueId || Number.isNaN(targetQueueId))) {
            toast.error("Select a target queue.");
            return;
        }

        const criteriaFilters = filters
            .filter((filter) => filter.fieldDefId)
            .map((filter) => {
                const field = filter.fieldDefId ? fieldMap.get(filter.fieldDefId) : null;
                return {
                    fieldDefId: filter.fieldDefId ?? undefined,
                    field: field?.apiName,
                    operator: filter.operator,
                    value: filter.value,
                };
            });

        try {
            const result = await createAssignmentRule({
                objectDefId,
                name: values.name,
                description: values.description,
                isActive,
                targetType: values.targetType,
                targetUserId,
                targetQueueId,
                criteria: { logic, filters: criteriaFilters },
            });

            if (result.success) {
                toast.success("Assignment rule created");
                setOpen(false);
                form.reset();
                setFilters([]);
                setLogic("ALL");
                setIsActive(true);
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Rule
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl overflow-hidden p-0">
                <div className="flex h-full flex-col bg-white">
                    <DialogHeader className="border-b border-border/50 bg-slate-50 px-6 py-4">
                        <DialogTitle className="text-lg">Create Assignment Rule</DialogTitle>
                        <DialogDescription>
                            Apply create-time assignment to a user or queue.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
                            <ScrollArea className="max-h-[75vh]">
                                <div className="px-6 py-5 space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            {fixedObject ? (
                                <div className="space-y-2">
                                    <FormLabel>Object</FormLabel>
                                    <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                                        {fixedObject.label}
                                    </div>
                                </div>
                            ) : (
                                <FormField
                                    control={form.control}
                                    name="objectDefId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Object</FormLabel>
                                            <FormControl>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select object..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {objects.map((object) => (
                                                            <SelectItem key={object.id} value={String(object.id)}>
                                                                {object.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="High-value leads" {...field} />
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
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Optional rule description..." {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="targetType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Assign To</FormLabel>
                                        <FormControl>
                                            <Select
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    form.setValue("targetUserId", "");
                                                    form.setValue("targetQueueId", "");
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="USER">User</SelectItem>
                                                    <SelectItem value="QUEUE">Queue</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {targetType === "USER" ? (
                                <FormField
                                    control={form.control}
                                    name="targetUserId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>User</FormLabel>
                                            <FormControl>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select user..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {users.map((user) => (
                                                            <SelectItem key={user.id} value={String(user.id)}>
                                                                {user.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            ) : (
                                <FormField
                                    control={form.control}
                                    name="targetQueueId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Queue</FormLabel>
                                            <FormControl>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select queue..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {queues.map((queue) => (
                                                        <SelectItem key={queue.id} value={String(queue.id)}>
                                                            {queue.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                                <p className="text-sm font-medium">Rule Status</p>
                                <p className="text-xs text-muted-foreground">Toggle to pause this rule.</p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium">Criteria</p>
                                    <p className="text-xs text-muted-foreground">
                                        Leave empty to match all records.
                                    </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                                    <Plus className="mr-2 h-3 w-3" />
                                    Add Filter
                                </Button>
                            </div>

                            {filters.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground text-center">
                                    No filters defined.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filters.map((filter) => {
                                        const field = filter.fieldDefId ? fieldMap.get(filter.fieldDefId) : null;
                                        const operators = getOperatorOptions(field?.type);
                                        const needsValue = !["is_blank", "is_not_blank"].includes(filter.operator);

                                        return (
                                            <div key={filter.id} className="rounded-lg border p-3 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-xs font-medium text-muted-foreground">
                                                        Condition
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeFilter(filter.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <div className="space-y-2">
                                                        <FormLabel className="text-xs">Field</FormLabel>
                                                        <Select
                                                            value={filter.fieldDefId ? String(filter.fieldDefId) : ""}
                                                            onValueChange={(value) =>
                                                                updateFilter(filter.id, { fieldDefId: Number(value) })
                                                            }
                                                            disabled={loadingFields}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={loadingFields ? "Loading..." : "Select field"} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {criteriaFields.map((fieldOption) => (
                                                                    <SelectItem key={fieldOption.id} value={String(fieldOption.id)}>
                                                                        {fieldOption.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <FormLabel className="text-xs">Operator</FormLabel>
                                                        <Select
                                                            value={filter.operator}
                                                            onValueChange={(value) => updateFilter(filter.id, { operator: value })}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {operators.map((op) => (
                                                                    <SelectItem key={op.value} value={op.value}>
                                                                        {op.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                        {needsValue && field?.type === "Picklist" && (
                                            <div className="space-y-2">
                                                <FormLabel className="text-xs">Value</FormLabel>
                                                <Select
                                                    value={filter.value}
                                                    onValueChange={(value) => updateFilter(filter.id, { value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select option" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {(field?.picklistOptions || [])
                                                            .filter((opt) => opt.isActive !== false)
                                                            .map((opt) => (
                                                                <SelectItem key={opt.id} value={String(opt.id)}>
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        {needsValue && field?.type !== "Picklist" && (
                                            <div className="space-y-2">
                                                <FormLabel className="text-xs">Value</FormLabel>
                                                <Input
                                                    type={getValueInputType(field?.type)}
                                                    value={getValueInputValue(field?.type, filter.value)}
                                                    onChange={(event) =>
                                                        updateFilter(filter.id, { value: event.target.value })
                                                    }
                                                    placeholder="Enter value"
                                                />
                                            </div>
                                        )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {filters.length > 1 && (
                                <div className="flex items-center gap-3">
                                    <FormLabel className="text-xs">Match Logic</FormLabel>
                                    <Select value={logic} onValueChange={(value: "ALL" | "ANY") => setLogic(value)}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All conditions (AND)</SelectItem>
                                            <SelectItem value="ANY">Any condition (OR)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                                </div>
                            </ScrollArea>
                            <DialogFooter className="border-t border-border/50 bg-slate-50 px-6 py-4">
                                <Button type="submit">Create Rule</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
