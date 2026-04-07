"use client";

import { useState } from "react";
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
import { Loader2, Database } from "lucide-react";
import { toast } from "sonner";
import { seedDemoData } from "@/actions/admin/seed-demo-data";

export function DemoDataButton() {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const handleSeed = async () => {
        setLoading(true);
        try {
            const result = await seedDemoData();
            if (result.success) {
                toast.success("Demo data populated successfully. All created users use password 123123.");
                setOpen(false);
            } else {
                toast.error(result.error || "Failed to populate data");
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Database className="h-4 w-4" />
                    Populate Demo Data
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Create Demo Data?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="text-muted-foreground text-sm">
                            This will add a simple sample workspace to your organization, including:
                            <ul className="list-disc pl-4 mt-2 space-y-1">
                                <li>2 sample apps: Jira and Healthcare</li>
                                <li>6 objects with fields, pages, and list views</li>
                                <li>Standard users, groups, queues, permissions, and sharing rules</li>
                                <li>Sample records and working dashboard widgets</li>
                            </ul>
                            <br />
                            This is intended for a fresh org. <strong>This action cannot be easily undone.</strong>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={(e) => {
                        e.preventDefault();
                        handleSeed();
                    }} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loading ? "Creating..." : "Yes, Create Data"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
