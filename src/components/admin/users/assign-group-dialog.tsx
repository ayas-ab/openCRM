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
import { assignPermissionSetGroup } from "@/actions/admin/user-actions";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    groupId: z.string().min(1, "Please select a group"),
});

interface AssignGroupDialogProps {
    userId: number;
    availableGroups: { id: number; name: string; description: string | null }[];
}

export function AssignGroupDialog({ userId, availableGroups }: AssignGroupDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            groupId: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const result = await assignPermissionSetGroup(userId, parseInt(values.groupId));

            if (result.success) {
                toast.success(`Assigned ${result.assignedCount} permission sets from this group`);
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
                <Button variant="outline" size="sm" className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Assign Group
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader className="border-b border-border/40 pb-4 mb-4">
                    <DialogTitle>Assign Permission Set Group</DialogTitle>
                    <DialogDescription>
                        Select a group to assign. All permission sets in the group will be assigned to this user.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField
                            control={form.control}
                            name="groupId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Permission Set Group</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm">
                                                <SelectValue placeholder="Select a group" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {availableGroups.map((group) => (
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
                        <DialogFooter className="justify-end border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
                            <Button type="submit" className="shadow-sm">Assign Group</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
