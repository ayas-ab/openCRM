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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { createRecordPageLayout } from "@/actions/admin/record-page-actions";
import { Plus } from "lucide-react";

const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    isDefault: z.boolean().default(false),
});

interface CreateRecordPageLayoutDialogProps {
    objectDefId: number;
}

export function CreateRecordPageLayoutDialog({ objectDefId }: CreateRecordPageLayoutDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: "",
            isDefault: false,
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        const result = await createRecordPageLayout({
            objectDefId,
            name: values.name,
            isDefault: values.isDefault,
        });

        if (result.success) {
            toast.success("Record page layout created");
            setOpen(false);
            form.reset();
            router.refresh();
        } else {
            toast.error(result.error || "Failed to create layout");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New Layout
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] bg-white">
                <DialogHeader className="border-b border-border/40 pb-4 mb-4">
                    <DialogTitle>Create Record Page Layout</DialogTitle>
                    <DialogDescription>
                        Start a new layout for this object.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Sales Default" {...field} className="shadow-sm bg-white" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isDefault"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/60 p-4 shadow-sm bg-muted/10">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-0.5 leading-none">
                                        <FormLabel className="font-semibold text-foreground">Set as default</FormLabel>
                                        <FormDescription className="text-xs">
                                            This layout is used when no assignment matches.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                        <DialogFooter className="justify-end border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
                            <Button type="submit" className="shadow-sm">Create Layout</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
