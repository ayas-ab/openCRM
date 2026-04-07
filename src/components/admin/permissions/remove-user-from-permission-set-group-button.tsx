"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserMinus } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { removeUserFromPermissionSetGroup } from "@/actions/admin/permission-actions";

type RemoveUserFromPermissionSetGroupButtonProps = {
    groupId: number;
    userId: number;
    userName: string;
    assignmentCount: number;
};

export function RemoveUserFromPermissionSetGroupButton({
    groupId,
    userId,
    userName,
    assignmentCount,
}: RemoveUserFromPermissionSetGroupButtonProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleRemove = async () => {
        setIsLoading(true);
        try {
            const result = await removeUserFromPermissionSetGroup(groupId, userId);
            if (result.success) {
                toast.success("User removed from group.");
                setConfirmOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || "Failed to remove user.");
            }
        } catch (error) {
            toast.error("Failed to remove user.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={isLoading}
                className="text-muted-foreground hover:text-destructive"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <UserMinus className="h-4 w-4 text-destructive" />
                        Remove user from group?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This will remove {userName} from the group and revoke{" "}
                        {assignmentCount} permission set assignment{assignmentCount === 1 ? "" : "s"}{" "}
                        granted by this group.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleRemove}
                        className="bg-destructive text-destructive-foreground"
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
