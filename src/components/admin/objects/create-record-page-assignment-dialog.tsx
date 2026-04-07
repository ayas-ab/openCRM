"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createRecordPageAssignment } from "@/actions/admin/record-page-actions";
import { Plus } from "lucide-react";

const ANY_VALUE = "__any__";
const formSchema = z.object({
    appId: z.string().min(1),
    layoutId: z.string().min(1),
    permissionSetId: z.string().optional(),
});

interface CreateRecordPageAssignmentDialogProps {
    objectDefId: number;
    apps: { id: number; name: string }[];
    layouts: { id: number; name: string }[];
    permissionSets: { id: number; name: string }[];
}

export function CreateRecordPageAssignmentDialog({
    objectDefId,
    apps,
    layouts,
    permissionSets,
}: CreateRecordPageAssignmentDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            appId: "",
            layoutId: "",
            permissionSetId: ANY_VALUE,
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        const result = await createRecordPageAssignment({
            objectDefId,
            appId: parseInt(values.appId, 10),
            layoutId: parseInt(values.layoutId, 10),
            permissionSetId:
                values.permissionSetId && values.permissionSetId !== ANY_VALUE
                    ? parseInt(values.permissionSetId, 10)
                    : null,
        });

        if (result.success) {
            toast.success("Record page assignment created");
            setOpen(false);
            form.reset();
            router.refresh();
        } else {
            toast.error(result.error || "Failed to create assignment");
        }
    };

    const hasLayouts = layouts.length > 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="shadow-sm" disabled={!hasLayouts}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Assignment
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] bg-white">
                <DialogHeader className="border-b border-border/40 pb-4 mb-4">
                    <DialogTitle>Create Record Page Assignment</DialogTitle>
                    <DialogDescription>
                        Choose where this layout applies.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField
                            control={form.control}
                            name="appId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">App</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm bg-white">
                                                <SelectValue placeholder="Select an app" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {apps.map((app) => (
                                                <SelectItem key={app.id} value={String(app.id)}>
                                                    {app.name}
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
                            name="layoutId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm bg-white">
                                                <SelectValue placeholder="Select a layout" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {layouts.map((layout) => (
                                                <SelectItem key={layout.id} value={String(layout.id)}>
                                                    {layout.name}
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
                            name="permissionSetId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permission Set (Optional)</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ANY_VALUE}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm bg-white">
                                                <SelectValue placeholder="Any permission set" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value={ANY_VALUE}>Any permission set</SelectItem>
                                            {permissionSets.map((set) => (
                                                <SelectItem key={set.id} value={String(set.id)}>
                                                    {set.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="justify-end border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
                            <Button type="submit" className="shadow-sm" disabled={!hasLayouts}>Create Assignment</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
