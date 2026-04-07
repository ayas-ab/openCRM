"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rebuildDependencyIndex } from "@/actions/admin/admin-actions";

export function RebuildDependencyIndexButton() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        setIsLoading(true);
        try {
            const result = await rebuildDependencyIndex();
            if (result.success) {
                toast.success("Dependency index rebuilt.");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to rebuild dependency index.");
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleClick} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Rebuild Dependency Index
        </Button>
    );
}
