"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { toggleAppPermission } from "@/actions/admin/permission-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AppPermissionToggleProps {
    permissionSetId: number;
    appId: number;
    initialValue: boolean;
}

export function AppPermissionToggle({ permissionSetId, appId, initialValue }: AppPermissionToggleProps) {
    const [checked, setChecked] = useState(initialValue);
    const router = useRouter();

    const handleToggle = async (checked: boolean) => {
        setChecked(checked); // Optimistic update
        try {
            const result = await toggleAppPermission(permissionSetId, appId, checked);
            if (!result.success) {
                setChecked(!checked); // Revert
                toast.error(result.error);
            } else {
                toast.success(checked ? "Access granted" : "Access revoked");
                router.refresh();
            }
        } catch (error) {
            setChecked(!checked);
            toast.error("Failed to update permission");
        }
    };

    return (
        <Checkbox
            checked={checked}
            onCheckedChange={handleToggle}
        />
    );
}
