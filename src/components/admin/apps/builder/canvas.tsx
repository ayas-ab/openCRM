"use client";

import { useBuilderStore, WidgetConfig, validateWidget } from "./builder-store";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function Canvas() {
    const { widgets, selectWidget, selectedWidgetId, removeWidget, moveWidget } = useBuilderStore();
    const selectedWidget = widgets.find((w) => w.id === selectedWidgetId);

    // Simple Drag and Drop Handler
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData("text/plain", index.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"));
        if (isNaN(sourceIndex)) return;
        moveWidget(sourceIndex, targetIndex);
    };

    return (
        <div className="grid grid-cols-12 gap-4 pb-20">
            {widgets.length === 0 && (
                <div className="col-span-12 h-64 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-muted-foreground bg-slate-50/50">
                    Select a widget from the toolbox to start
                </div>
            )}

            {widgets.map((widget, index) => (
                <div
                    key={widget.id}
                    className={cn(
                        "relative group transition-all duration-200",
                        widget.colSpan ? `col-span-${widget.colSpan}` : "col-span-4",
                        // Fallback styles for grid cols because Tailwind needs full classes to compile usually, 
                        // but we'll try inline style for width if grid-cols fail, or just rely on safelisting.
                        // For now simpler: assume 12 col grid works if classes are standard.
                        // We might need to map colSpan to specific classes:
                        widget.colSpan === 3 ? "col-span-3" :
                            widget.colSpan === 4 ? "col-span-4" :
                                widget.colSpan === 6 ? "col-span-6" :
                                    widget.colSpan === 8 ? "col-span-8" :
                                        widget.colSpan === 12 ? "col-span-12" : "col-span-4"
                    )}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => {
                        if (selectedWidget && selectedWidget.id !== widget.id) {
                            const errors = validateWidget(selectedWidget);
                            if (errors.length > 0) {
                                toast.error(`Fix required fields before switching: ${errors[0]}`);
                                return;
                            }
                        }
                        selectWidget(widget.id);
                    }}
                >
                    <div className={cn(
                        "border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-all h-32 flex flex-col cursor-pointer ring-2 ring-transparent",
                        selectedWidgetId === widget.id && "ring-primary border-primary"
                    )}>
                        <div className="flex justify-between items-start mb-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <div className="cursor-move p-1 hover:bg-slate-100 rounded">
                                <GripVertical className="h-4 w-4 text-slate-400" />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-400 hover:text-red-100 hover:bg-red-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeWidget(widget.id);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>

                        <div className="flex-1 flex items-center justify-center flex-col text-slate-500 gap-1 pointer-events-none select-none">
                            <span className="font-semibold text-slate-900">{widget.title}</span>
                            <span className="text-xs uppercase tracking-wider">{widget.type}</span>
                            {validateWidget(widget).length > 0 && (
                                <span className="text-[10px] text-amber-600 mt-1">Missing required fields</span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
