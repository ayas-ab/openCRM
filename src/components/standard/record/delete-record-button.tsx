"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { deleteRecord } from "@/actions/standard/record-actions";

export function DeleteRecordButton({
    appApiName,
    objectApiName,
    recordId,
    recordLabel,
}: {
    appApiName: string;
    objectApiName: string;
    recordId: number;
    recordLabel: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deleteRecord(appApiName, objectApiName, recordId);
            if (!result.success) {
                toast.error(result.error || "Failed to delete record.");
                return;
            }

            toast.success("Record deleted.");
            setOpen(false);
            router.push(`/app/${appApiName}/${objectApiName}`);
            router.refresh();
        } catch {
            toast.error("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete this record?</DialogTitle>
                    <DialogDescription>
                        This permanently deletes "{recordLabel}" and clears inbound lookup references to it.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
