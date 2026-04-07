"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { DependencyList } from "@/components/admin/objects/dependency-list";
import type { MetadataDependencyDetail } from "@/lib/metadata-dependencies";

export function FieldWhereUsedButton({
    label,
    dependencies,
}: {
    label: string;
    dependencies: MetadataDependencyDetail[];
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" title="Where used">
                    <Search className="h-4 w-4 text-slate-500" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Where "{label}" is used</DialogTitle>
                    <DialogDescription>
                        Review every metadata reference before changing or deleting this field.
                    </DialogDescription>
                </DialogHeader>
                <DependencyList
                    dependencies={dependencies}
                    emptyMessage="This field is not currently referenced by metadata."
                />
            </DialogContent>
        </Dialog>
    );
}
