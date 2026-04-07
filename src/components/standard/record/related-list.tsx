"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { format } from "date-fns";

interface RelatedListProps {
    title: string;
    objectApiName: string;
    records: { id: number; name: string; createdAt: Date }[];
    appApiName: string;
    fieldApiName?: string;
    parentRecordId?: number;
}

export function RelatedList({ title, objectApiName, records, appApiName, fieldApiName, parentRecordId }: RelatedListProps) {
    return (
        <Card className="shadow-sm border-border/60 hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    {title}
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                        {records.length}
                    </span>
                </CardTitle>
                <Button variant="outline" size="sm" asChild className="h-8 shadow-sm">
                    <Link href={`/app/${appApiName}/${objectApiName}/new${fieldApiName && parentRecordId ? `?${fieldApiName}=${parentRecordId}` : ''}`}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        New
                    </Link>
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                {records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/5">
                        <p className="text-xs text-muted-foreground">No records found.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/40">
                        {records.map((record) => (
                            <div key={record.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors group">
                                <Link
                                    href={`/app/${appApiName}/${objectApiName}/${record.id}`}
                                    className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
                                >
                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        {record.name.substring(0, 1).toUpperCase()}
                                    </div>
                                    {record.name}
                                </Link>
                                <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                                    {format(new Date(record.createdAt), "MMM d, yyyy")}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
