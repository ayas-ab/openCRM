"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteAssignmentRule, toggleAssignmentRule } from "@/actions/admin/assignment-rule-actions";
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
import { Trash2 } from "lucide-react";

export function AssignmentRuleActions({
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
            const result = await toggleAssignmentRule(ruleId, !isActive);
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
            const result = await deleteAssignmentRule(ruleId);
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
                <AlertDialogContent className="sm:max-w-[440px]">
                    <AlertDialogHeader className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <AlertDialogTitle>Delete this assignment rule?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This removes the rule and stops any new records from being routed by it.
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
