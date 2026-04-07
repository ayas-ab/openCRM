"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { deleteDuplicateRule, toggleDuplicateRule } from "@/actions/admin/duplicate-rule-actions";

export function DuplicateRuleActions({
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
            const result = await toggleDuplicateRule(ruleId, !isActive);
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
            const result = await deleteDuplicateRule(ruleId);
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
                        <AlertDialogTitle>Delete duplicate rule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the rule and stops duplicate checking for it.
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
