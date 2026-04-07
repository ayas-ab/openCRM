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
import { assignPermissionSet } from "@/actions/admin/user-actions";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    permissionSetId: z.string().min(1, "Permission Set is required"),
});

interface AssignPermissionSetDialogProps {
    userId: number;
    availablePermissionSets: { id: number; name: string }[];
}

export function AssignPermissionSetDialog({ userId, availablePermissionSets }: AssignPermissionSetDialogProps) {
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
            const result = await assignPermissionSet(userId, parseInt(values.permissionSetId));

            if (result.success) {
                toast.success("Permission Set assigned");
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
                Assign Permission Set
            </Button>
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Assign Permission Set
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader className="border-b border-border/40 pb-4 mb-4">
                    <DialogTitle>Assign Permission Set</DialogTitle>
                    <DialogDescription>
                        Select a permission set to assign to this user.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField
                            control={form.control}
                            name="permissionSetId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Permission Set</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="shadow-sm">
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
                        <DialogFooter className="justify-end border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
                            <Button type="submit" className="shadow-sm">Assign</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
