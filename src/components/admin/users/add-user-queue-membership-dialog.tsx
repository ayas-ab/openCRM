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
import { ScrollArea } from "@/components/ui/scroll-area";
import { addQueueMember } from "@/actions/admin/queue-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

const formSchema = z.object({
    queueId: z.string().min(1, "Queue is required"),
});

type QueueOption = {
    id: string;
    label: string;
};

export function AddUserQueueMembershipDialog({
    userId,
    queues,
}: {
    userId: number;
    queues: QueueOption[];
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            queueId: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const result = await addQueueMember(parseInt(values.queueId, 10), userId);
            if (result.success) {
                toast.success("Queue membership added.");
                setOpen(false);
                form.reset();
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
                <Button variant="outline" disabled={queues.length === 0}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Queue
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] overflow-hidden p-0">
                <div className="flex h-full flex-col bg-white">
                    <DialogHeader className="border-b border-border/50 bg-slate-50 px-6 py-4">
                        <DialogTitle className="text-lg">Add Queue Membership</DialogTitle>
                        <DialogDescription>
                            Add this user to a queue so they can access queue-owned records for that queue.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
                            <ScrollArea className="max-h-[50vh]">
                                <div className="space-y-4 px-6 py-5">
                                    <FormField
                                        control={form.control}
                                        name="queueId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Queue</FormLabel>
                                                <FormControl>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a queue" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {queues.map((queue) => (
                                                                <SelectItem key={queue.id} value={queue.id}>
                                                                    {queue.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </ScrollArea>
                            <DialogFooter className="border-t border-border/50 bg-slate-50 px-6 py-4">
                                <Button type="submit" disabled={queues.length === 0}>
                                    Add
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
