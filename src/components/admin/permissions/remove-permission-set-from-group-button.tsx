"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { removePermissionSetFromGroup } from "@/actions/admin/permission-actions";
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

interface RemovePermissionSetFromGroupButtonProps {
    groupId: number;
    permissionSetId: number;
}

export function RemovePermissionSetFromGroupButton({ groupId, permissionSetId }: RemovePermissionSetFromGroupButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const router = useRouter();

    const handleRemove = async () => {
        setIsLoading(true);
        try {
            const result = await removePermissionSetFromGroup(groupId, permissionSetId);
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

    return (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={isLoading}>
                <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove permission set?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes the permission set from the group and revokes any access granted by this group.
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
