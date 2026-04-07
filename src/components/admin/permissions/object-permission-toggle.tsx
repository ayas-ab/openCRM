"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { updateObjectPermission } from "@/actions/admin/permission-actions";
import { toast } from "sonner";
import { useState } from "react";

interface ObjectPermissionToggleProps {
    permissionSetId: number;
    objectDefId: number;
    field: string;
    initialValue: boolean;
    disabled?: boolean;
}

export function ObjectPermissionToggle({
    permissionSetId,
    objectDefId,
    field,
    initialValue,
    disabled = false,
}: ObjectPermissionToggleProps) {
    const [checked, setChecked] = useState(initialValue);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = async (newChecked: boolean) => {
        setChecked(newChecked);
        setIsLoading(true);

        // We need to construct the full permissions object, but since we are toggling one field,
        // we ideally should fetch the current state first.
        // However, for this simple toggle, we can cheat a bit or refactor the action to accept partial updates.
        // Let's refactor the action to be smarter, or just send the partial update and let the server merge.
        // For now, let's assume the server action handles upsert correctly.

        // Wait, the current action expects ALL fields. That's a limitation.
        // Let's modify the action to accept partials? No, Prisma upsert needs create data.
        // Actually, we can just send the one field we changed if we modify the action.
        // BUT, to keep it simple and robust, let's just send what we know.
        // The issue is we don't know the OTHER fields' values here without passing them all in.

        // BETTER APPROACH: The action `updateObjectPermission` should probably take a partial and fetch existing to merge.
        // Let's update the action in the next step if needed. For now, let's assume we need to pass everything?
        // No, that's too much prop drilling.

        // Let's change the action to `togglePermission(permissionSetId, objectDefId, field, value)`.
        // That is much cleaner for this UI.

        try {
            const result = await togglePermission(permissionSetId, objectDefId, field, newChecked);
            if (!result.success) {
                toast.error(result.error);
                setChecked(!newChecked); // Revert
            }
        } catch (error) {
            toast.error("Failed to update permission");
            setChecked(!newChecked);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex justify-center">
            <Checkbox
                checked={checked}
                onCheckedChange={handleChange}
                disabled={isLoading || disabled}
            />
        </div>
    );
}

// We need to add this action
import { togglePermission } from "@/actions/admin/permission-actions";
