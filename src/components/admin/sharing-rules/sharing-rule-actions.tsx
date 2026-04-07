"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteSharingRule, toggleSharingRule } from "@/actions/admin/sharing-rule-actions";
import { useRouter } from "next/navigation";
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

export function SharingRuleActions({
    ruleId,
    isActive,
}: {
    ruleId: number;
    isActive: boolean;
}) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleToggle = () => {
        startTransition(async () => {
            const result = await toggleSharingRule(ruleId, !isActive);
            if (result.success) {
                toast.success(isActive ? "Rule deactivated" : "Rule activated");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    };

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteSharingRule(ruleId);
            if (result.success) {
                toast.success("Rule deleted");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToggle} disabled={isPending}>
                {isActive ? "Deactivate" : "Activate"}
            </Button>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={isPending}>
                        Delete
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete sharing rule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the rule. Any shared access created by it will be rebuilt by the background job.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
