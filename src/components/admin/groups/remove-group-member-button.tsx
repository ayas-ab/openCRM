"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeUserFromGroup } from "@/actions/admin/group-actions";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function RemoveGroupMemberButton({
    userId,
    userLabel,
    userEmail,
}: {
    userId: number;
    userLabel: string;
    userEmail?: string | null;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleRemove = () => {
        startTransition(async () => {
            const result = await removeUserFromGroup(userId);
            if (result.success) {
                toast.success("User removed from group");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isPending}>
                    Remove
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove user from this group?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {userLabel}
                        {userEmail ? ` (${userEmail})` : ""} will lose any access granted by this group.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleRemove}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
