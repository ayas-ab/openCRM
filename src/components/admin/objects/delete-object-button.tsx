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
import { deleteObjectDefinition } from "@/actions/admin/admin-actions";
import { DependencyList } from "@/components/admin/objects/dependency-list";
import type { MetadataDependencyDetail } from "@/lib/metadata-dependencies";

export function DeleteObjectButton({
    objectDefId,
    label,
    isSystem,
    initialDependencies,
    initialRecordCount,
}: {
    objectDefId: number;
    label: string;
    isSystem: boolean;
    initialDependencies: MetadataDependencyDetail[];
    initialRecordCount: number;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [blockedDependencies, setBlockedDependencies] = useState(initialDependencies);
    const [blockedRecordCount, setBlockedRecordCount] = useState(initialRecordCount);

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deleteObjectDefinition(objectDefId);
            if (result.success) {
                toast.success("Object deleted");
                setOpen(false);
                router.push("/admin/objects");
                router.refresh();
                return;
            }

            const dependencies = Array.isArray((result as any).dependencies)
                ? ((result as any).dependencies as MetadataDependencyDetail[])
                : [];
            const recordCount = typeof (result as any).recordCount === "number" ? (result as any).recordCount : 0;

            if (dependencies.length > 0 || recordCount > 0) {
                setBlockedDependencies(dependencies);
                setBlockedRecordCount(recordCount);
                return;
            }

            toast.error(result.error || "Failed to delete object.");
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const isBlocked = blockedDependencies.length > 0 || blockedRecordCount > 0;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setBlockedDependencies(initialDependencies);
                    setBlockedRecordCount(initialRecordCount);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isSystem}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Object
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
                {isBlocked ? (
                    <div className="flex max-h-[calc(85vh-2rem)] flex-col gap-4">
                        <DialogHeader>
                            <DialogTitle>Object cannot be deleted</DialogTitle>
                            <DialogDescription>
                                Clear the blockers below before deleting "{label}".
                            </DialogDescription>
                        </DialogHeader>
                        {blockedRecordCount > 0 ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                This object still has {blockedRecordCount} record{blockedRecordCount === 1 ? "" : "s"}.
                                Delete or migrate those records first.
                            </div>
                        ) : null}
                        <div className="min-h-0 overflow-y-auto pr-2">
                            <DependencyList
                                dependencies={blockedDependencies}
                                emptyMessage="No metadata dependencies found."
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Delete this object?</DialogTitle>
                            <DialogDescription>
                                This permanently deletes the custom object definition and its child metadata.
                                This cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>
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
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
