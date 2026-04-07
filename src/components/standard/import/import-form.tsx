"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startImport, type ImportActionState } from "@/actions/standard/import-actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const initialState: ImportActionState = { success: false };

export function ImportForm({
    appApiName,
    objectApiName,
    canImport,
    canCreate,
    canEdit,
}: {
    appApiName: string;
    objectApiName: string;
    canImport: boolean;
    canCreate: boolean;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(startImport, initialState);
    const defaultMode = canCreate ? "INSERT" : canEdit ? "UPDATE" : "INSERT";
    const [mode, setMode] = useState(defaultMode);

    const modeOptions = [
        canCreate ? { value: "INSERT", label: "Insert" } : null,
        canEdit ? { value: "UPDATE", label: "Update" } : null,
        canCreate && canEdit ? { value: "UPSERT", label: "Upsert" } : null,
    ].filter(Boolean) as Array<{ value: string; label: string }>;

    const canRun = canImport && modeOptions.length > 0;

    useEffect(() => {
        if (state.success && state.jobId) {
            router.refresh();
        }
    }, [state.success, state.jobId, router]);

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="objectApiName" value={objectApiName} />

            <div className="grid gap-3 md:grid-cols-[1.2fr_0.6fr_auto] items-end">
                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        File (CSV)
                    </label>
                    <Input
                        type="file"
                        name="file"
                        accept=".csv"
                        disabled={!canRun || isPending}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Mode
                    </label>
                    <input type="hidden" name="mode" value={mode} />
                    <Select value={mode} onValueChange={setMode} disabled={!canRun || isPending}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {modeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex gap-2">
                    <Button type="submit" disabled={!canRun || isPending}>
                        {isPending ? "Starting..." : "Start Import"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                        window.location.href = `/app/${appApiName}/${objectApiName}/import/template`;
                    }}>
                        Download Template
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.push(`/app/${appApiName}/${objectApiName}`)}>
                        Back
                    </Button>
                </div>
            </div>

            {state.error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {state.error}
                </div>
            )}

            {state.success && state.jobId && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Import job created.{" "}
                    <a className="font-medium underline" href={`/app/${appApiName}/${objectApiName}/import/${state.jobId}`}>
                        View details
                    </a>
                    .
                </div>
            )}
        </form>
    );
}
