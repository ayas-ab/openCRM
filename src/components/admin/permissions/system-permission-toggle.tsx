"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { toggleSystemPermission } from "@/actions/admin/permission-actions";

interface SystemPermissionToggleProps {
    permissionSetId: number;
    field: "allowDataLoading";
    initialValue: boolean;
}

export function SystemPermissionToggle({
    permissionSetId,
    field,
    initialValue,
}: SystemPermissionToggleProps) {
    const [checked, setChecked] = useState(initialValue);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = async (newChecked: boolean) => {
        setChecked(newChecked);
        setIsLoading(true);

        try {
            const result = await toggleSystemPermission(permissionSetId, field, newChecked);
            if (!result.success) {
                toast.error(result.error || "Failed to update permission");
                setChecked(!newChecked);
            }
        } catch {
            toast.error("Failed to update permission");
            setChecked(!newChecked);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex justify-center">
            <Checkbox checked={checked} onCheckedChange={handleChange} disabled={isLoading} />
        </div>
    );
}
