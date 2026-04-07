"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setDefaultRecordPageLayout } from "@/actions/admin/record-page-actions";

interface SetDefaultRecordPageLayoutButtonProps {
    layoutId: number;
    isDefault: boolean;
}

export function SetDefaultRecordPageLayoutButton({
    layoutId,
    isDefault,
}: SetDefaultRecordPageLayoutButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    if (isDefault) {
        return (
            <Button variant="outline" size="sm" disabled>
                Default
            </Button>
        );
    }

    const handleSetDefault = () => {
        startTransition(async () => {
            const result = await setDefaultRecordPageLayout(layoutId);
            if (result.success) {
                toast.success("Default layout updated");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to set default layout");
            }
        });
    };

    return (
        <Button variant="outline" size="sm" onClick={handleSetDefault} disabled={isPending}>
            Set Default
        </Button>
    );
}
