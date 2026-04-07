"use client";

import { useBuilderStore } from "./builder-store";
import { Button } from "@/components/ui/button";
import { BarChart3, Calculator, List } from "lucide-react";

export function WidgetToolbox() {
    const { addWidget } = useBuilderStore();

    return (
        <div className="p-4 space-y-4">
            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Core Widgets</p>

                <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3 border-slate-200 hover:border-primary/50 hover:bg-slate-50 transition-all font-normal shadow-sm"
                    onClick={() => addWidget("metric")}
                >
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <span className="block font-medium text-slate-700">Metric Card</span>
                        <span className="text-xs text-muted-foreground block">KPIs, Counts, Sums</span>
                    </div>
                </Button>

                <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3 border-slate-200 hover:border-primary/50 hover:bg-slate-50 transition-all font-normal shadow-sm"
                    onClick={() => addWidget("chart")}
                >
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-md">
                        <BarChart3 className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <span className="block font-medium text-slate-700">Chart Widget</span>
                        <span className="text-xs text-muted-foreground block">Bar, Line, Pie</span>
                    </div>
                </Button>

                <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3 border-slate-200 hover:border-primary/50 hover:bg-slate-50 transition-all font-normal shadow-sm"
                    onClick={() => addWidget("list")}
                >
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-md">
                        <List className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <span className="block font-medium text-slate-700">List Widget</span>
                        <span className="text-xs text-muted-foreground block">Recent Records</span>
                    </div>
                </Button>
            </div>
        </div>
    );
}
