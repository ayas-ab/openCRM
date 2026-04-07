"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { checkFieldDeleteDefinition, deleteFieldDefinition } from "@/actions/admin/admin-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import type { MetadataDependencyDetail } from "@/lib/metadata-dependencies";
import { DependencyList } from "@/components/admin/objects/dependency-list";

interface DeleteFieldButtonProps {
    fieldId: number;
    objectDefId: number;
    label: string;
    apiName: string;
}

export function DeleteFieldButton({ fieldId, objectDefId, label, apiName }: DeleteFieldButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [blockedDependencies, setBlockedDependencies] = useState<MetadataDependencyDetail[]>([]);
    const [mode, setMode] = useState<"confirm" | "blocked">("confirm");
    const router = useRouter();
    const isNameField = apiName === "name";

    const handleOpen = async () => {
        if (isNameField || isLoading) return;

        setIsLoading(true);
        try {
            // Preflight the delete so the first modal state is accurate:
            // blocked fields open the dependency view, safe fields open confirm.
            const result = await checkFieldDeleteDefinition(fieldId, objectDefId);
            if (!result.success) {
                toast.error(result.error || "Failed to check field delete.");
                return;
            }

            const dependencies = Array.isArray((result as any).dependencies)
                ? ((result as any).dependencies as MetadataDependencyDetail[])
                : [];

            if (dependencies.length > 0) {
                setBlockedDependencies(dependencies);
                setMode("blocked");
            } else {
                setBlockedDependencies([]);
                setMode("confirm");
            }

            setOpen(true);
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (isNameField) return;
        setIsLoading(true);
        try {
            const result = await deleteFieldDefinition(fieldId, objectDefId);
            if (result.success) {
                toast.success("Field deleted");
                setBlockedDependencies([]);
                setMode("confirm");
                setOpen(false);
                router.refresh();
            } else {
                const dependencies = Array.isArray((result as any).dependencies)
                    ? ((result as any).dependencies as MetadataDependencyDetail[])
                    : [];
                if (dependencies.length > 0) {
                    setBlockedDependencies(dependencies);
                    setMode("blocked");
                    return;
                }
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    setBlockedDependencies([]);
                    setMode("confirm");
                }
                setOpen(nextOpen);
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={isLoading || isNameField}
                    title={isNameField ? "The Name field cannot be deleted." : "Delete field"}
                    onClick={(event) => {
                        event.preventDefault();
                        void handleOpen();
                    }}
                >
                    <Trash2 className={`h-4 w-4 ${isNameField ? "text-muted-foreground" : "text-red-500"}`} />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
                {mode === "blocked" ? (
                    <div className="flex max-h-[calc(85vh-2rem)] flex-col gap-4">
                        <DialogHeader className="space-y-2">
                            <DialogTitle>Field cannot be deleted</DialogTitle>
                            <DialogDescription>
                                "{label}" is still referenced by metadata. Remove these dependencies first, then try again.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="min-h-0 overflow-y-auto pr-2">
                            <DependencyList dependencies={blockedDependencies} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <>
                        <DialogHeader className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                                    <Trash2 className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    <DialogTitle>Delete this field?</DialogTitle>
                                    <DialogDescription>
                                        "{label}" is safe to delete. This permanently removes the field and deletes all stored values.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDelete}
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
