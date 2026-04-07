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
import { deleteRecordPageLayout } from "@/actions/admin/record-page-actions";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

interface DeleteRecordPageLayoutButtonProps {
    layoutId: number;
    label: string;
    isDefault?: boolean;
}

export function DeleteRecordPageLayoutButton({
    layoutId,
    label,
    isDefault,
}: DeleteRecordPageLayoutButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteRecordPageLayout(layoutId);
            if (result.success) {
                toast.success("Layout deleted");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to delete layout");
            }
        });
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isPending}>
                    Delete
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-[440px]">
                <AlertDialogHeader className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <AlertDialogTitle>Delete this layout?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This removes the layout and any assignments that reference it.
                            </AlertDialogDescription>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{label}</Badge>
                        {isDefault && <Badge variant="outline">Default layout</Badge>}
                    </div>
                    {isDefault && (
                        <p className="text-xs text-muted-foreground">
                            Default layouts must be replaced before deletion.
                        </p>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
