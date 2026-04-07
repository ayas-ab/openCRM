"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { removePermissionAssignment } from "@/actions/admin/user-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

interface RemovePermissionAssignmentButtonProps {
    userId: number;
    permissionSetId: number;
    hasDirectSource: boolean;
    groupSourceCount: number;
}

export function RemovePermissionAssignmentButton({
    userId,
    permissionSetId,
    hasDirectSource,
    groupSourceCount,
}: RemovePermissionAssignmentButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const router = useRouter();

    const handleRemove = async () => {
        setIsLoading(true);
        try {
            const result = await removePermissionAssignment(userId, permissionSetId);
            if (result.success) {
                toast.success("Removed successfully");
                setConfirmOpen(false);
                router.refresh();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    if (!hasDirectSource) {
        return (
            <Badge variant="secondary" className="text-xs">
                Group-managed
            </Badge>
        );
    }

    return (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={isLoading}>
                <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove permission set?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes the direct assignment.{" "}
                        {groupSourceCount > 0
                            ? "The user will still keep access from their group."
                            : "The user will lose access to this permission set."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground">
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
