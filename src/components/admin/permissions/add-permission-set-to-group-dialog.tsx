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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { addPermissionSetToGroup } from "@/actions/admin/permission-actions";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    permissionSetId: z.string().min(1, "Permission Set is required"),
});

interface AddPermissionSetToGroupDialogProps {
    groupId: number;
    availablePermissionSets: { id: number; name: string }[];
}

export function AddPermissionSetToGroupDialog({ groupId, availablePermissionSets }: AddPermissionSetToGroupDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            permissionSetId: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const result = await addPermissionSetToGroup(groupId, parseInt(values.permissionSetId));

            if (result.success) {
                toast.success("Permission Set added to group");
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

    if (availablePermissionSets.length === 0) {
        return (
            <Button disabled>
                <Plus className="mr-2 h-4 w-4" />
                Add Permission Set
            </Button>
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Permission Set
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Permission Set</DialogTitle>
                    <DialogDescription>
                        Select a permission set to add to this group.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="permissionSetId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Permission Set</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a permission set" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {availablePermissionSets.map((ps) => (
                                                <SelectItem key={ps.id} value={String(ps.id)}>
                                                    {ps.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit">Add</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
