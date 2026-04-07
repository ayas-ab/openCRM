"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reorderDuplicateRules } from "@/actions/admin/duplicate-rule-actions";

export function DuplicateRuleOrderControls({
    objectDefId,
    ruleIds,
    index,
}: {
    objectDefId: number;
    ruleIds: number[];
    index: number;
}) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const move = (direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= ruleIds.length) return;

        const nextOrder = [...ruleIds];
        [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];

        startTransition(async () => {
            const result = await reorderDuplicateRules(objectDefId, nextOrder);
            if (result.success) {
                toast.success("Rule order updated");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => move("up")} disabled={isPending || index === 0}>
                <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => move("down")}
                disabled={isPending || index === ruleIds.length - 1}
            >
                <ArrowDown className="h-4 w-4" />
            </Button>
        </div>
    );
}
