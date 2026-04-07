"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteImportJob } from "@/actions/standard/import-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

export function ImportJobDeleteButton({
    jobId,
    objectApiName,
}: {
    jobId: number;
    objectApiName: string;
}) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deleteImportJob(jobId, objectApiName);
            if (!result.success) {
                toast.error(result.error || "Failed to delete import");
                return;
            }
            toast.success("Import deleted");
            router.refresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete import");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isLoading}>
                    Delete
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete import?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will remove the import log and all stored row results. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
