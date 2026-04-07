"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { claimRecord } from "@/actions/standard/record-actions";

interface ClaimRecordButtonProps {
    objectApiName: string;
    recordId: number;
}

export function ClaimRecordButton({ objectApiName, recordId }: ClaimRecordButtonProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    return (
        <Button
            onClick={() => {
                startTransition(async () => {
                    const result = await claimRecord(objectApiName, recordId);
                    if (result.success) {
                        toast.success("Record claimed");
                        router.refresh();
                    } else {
                        toast.error(result.error || "Failed to claim record");
                    }
                });
            }}
            disabled={isPending}
            className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
        >
            <UserCheck className="mr-2 h-4 w-4" />
            Claim
        </Button>
    );
}
