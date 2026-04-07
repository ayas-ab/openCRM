"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { deletePermissionSetGroup } from "@/actions/admin/permission-actions";

type DeletePermissionSetGroupButtonProps = {
    groupId: number;
    name: string;
};

export function DeletePermissionSetGroupButton({ groupId, name }: DeletePermissionSetGroupButtonProps) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deletePermissionSetGroup(groupId);
            if (!result.success) {
                toast.error(result.error || "Failed to delete group.");
                return;
            }
            toast.success("Permission set group deleted.");
            setOpen(false);
            router.push("/admin/permission-groups");
            router.refresh();
        } catch (error) {
            toast.error("Failed to delete group.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete group
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes the group and its membership mapping. Users keep the permission sets,
                        but the group tag will disappear.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground"
                        disabled={isLoading}
                    >
                        {isLoading ? "Deleting..." : "Delete group"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
