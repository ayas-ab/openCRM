"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { removeQueueMember } from "@/actions/admin/queue-actions";
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
} from "@/components/ui/alert-dialog";

export function RemoveQueueMemberButton({
    queueId,
    userId,
    memberName,
    queueName,
}: {
    queueId: number;
    userId: number;
    memberName?: string;
    queueName?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    async function handleRemove() {
        try {
            setIsRemoving(true);
            const result = await removeQueueMember(queueId, userId);
            if (result.success) {
                toast.success("Member removed from queue.");
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } finally {
            setIsRemoving(false);
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                Remove
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove member from queue?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {memberName || "This user"} will lose access to queue-owned records in{" "}
                        <span className="font-medium text-foreground">{queueName || "this queue"}</span>{" "}
                        unless access comes from another source.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(event) => {
                            event.preventDefault();
                            void handleRemove();
                        }}
                        disabled={isRemoving}
                    >
                        {isRemoving ? "Removing..." : "Remove member"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
