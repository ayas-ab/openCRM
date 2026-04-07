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
import { deleteRecordPageAssignment } from "@/actions/admin/record-page-actions";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

interface DeleteRecordPageAssignmentButtonProps {
    assignmentId: number;
    label: string;
}

export function DeleteRecordPageAssignmentButton({
    assignmentId,
    label,
}: DeleteRecordPageAssignmentButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteRecordPageAssignment(assignmentId);
            if (result.success) {
                toast.success("Assignment removed");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to delete assignment");
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
            <AlertDialogContent className="sm:max-w-[440px]">
                <AlertDialogHeader className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <AlertDialogTitle>Remove this assignment?</AlertDialogTitle>
                            <AlertDialogDescription>
                                The layout will no longer match this rule.
                            </AlertDialogDescription>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{label}</Badge>
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
