"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateManagedUserAccount } from "@/actions/admin/user-actions";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-z0-9]+$/, "Username must be lowercase letters and numbers only"),
    email: z
        .string()
        .trim()
        .optional()
        .refine((value) => !value || z.string().email().safeParse(value).success, "Invalid email address"),
    userType: z.enum(["standard", "admin"]),
    groupId: z.string(),
});

type GroupOption = {
    id: number;
    name: string;
};

interface UserAccountFormProps {
    user: {
        id: number;
        name: string | null;
        username: string;
        email: string | null;
        userType: "admin" | "standard";
        groupId: number | null;
    };
    groups: GroupOption[];
    queueNames: string[];
}

export function UserAccountForm({ user, groups, queueNames }: UserAccountFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: user.name ?? "",
            username: user.username,
            email: user.email ?? "",
            userType: user.userType,
            groupId: user.groupId ? String(user.groupId) : "none",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true);
        try {
            const result = await updateManagedUserAccount(user.id, {
                name: values.name,
                username: values.username,
                email: values.email || null,
                userType: values.userType,
                groupId: values.groupId === "none" ? null : parseInt(values.groupId, 10),
            });

            if (result.success) {
                toast.success("User account updated");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="userType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Role</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a role" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="standard">Standard User</SelectItem>
                                        <SelectItem value="admin">Administrator</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="groupId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Group</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="No group" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">No group</SelectItem>
                                        {groups.map((group) => (
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
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Queue Memberships</div>
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                            <div className="flex flex-wrap gap-2">
                                {queueNames.length > 0 ? (
                                    queueNames.map((queueName) => (
                                        <Badge key={queueName} variant="outline">
                                            {queueName}
                                        </Badge>
                                    ))
                                ) : (
                                    <span className="text-sm text-muted-foreground">No queue memberships</span>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Queue membership is managed from queue administration pages.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 border-t pt-4">
                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Account Changes
                    </Button>
                </div>
            </form>
        </Form>
    );
}
