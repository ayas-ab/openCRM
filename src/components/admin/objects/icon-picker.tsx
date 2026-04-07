"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

// Expanded icon set for better variety
const ICON_OPTIONS = [
  "Box", "Buildings", "Briefcase", "User", "Users", "Phone", "Mail", "Calendar",
  "Handshake", "Shield", "ChartColumn", "ChartPie", "Wallet", "CreditCard", "Car", "Store",
  "Building2", "ClipboardList", "ClipboardCheck", "FileText", "Folder", "Globe", "MapPin", "Clock3",
  "Star", "Tags", "Ticket", "Flame", "Sparkles", "Rocket", "Leaf", "Cpu", "Monitor", "Laptop",
  "Link", "Lock", "Key", "Award", "BookOpen", "Gauge", "Activity", "BarChartHorizontal", "Cloud",
  "Archive", "Bell", "Bookmark", "Calculator", "Camera", "CheckCircle", "Circle", "Compass",
  "Copy", "Database", "DollarSign", "Eye", "File", "Filter", "Flag", "Gift", "Hash", "Heart",
  "Home", "Image", "Info", "Layers", "Layout", "Lightbulb", "LockOpen", "Map", "Menu", "MessageCircle",
  "Minus", "MoreHorizontal", "Paperclip", "Play", "Plus", "Power", "Printer", "Search", "Send",
  "Settings", "Share", "ShoppingBag", "ShoppingCart", "Smartphone", "Smile", "Save", "Table", "Terminal",
  "ThumbsUp", "Tool", "Trash", "Truck", "Umbrella", "Unlock", "Upload", "Video", "Zap"
];

function getIconComponent(name: string) {
  return (Icons as any)[name] as React.ComponentType<{ className?: string }> | undefined;
}

interface IconPickerProps {
  value?: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const iconList = useMemo(() => {
    const list = ICON_OPTIONS.filter((name) => getIconComponent(name));
    if (!searchTerm) return list;
    return list.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search icons..."
          className="pl-9 bg-muted/40"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <ScrollArea className="h-[280px] rounded-lg border bg-muted/10 p-2">
        {iconList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground text-sm p-4">
            <p>No icons found</p>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {iconList.map((name) => {
              const Icon = getIconComponent(name) || Icons.Box;
              const selected = value === name;
              return (
                <Button
                  key={name}
                  type="button"
                  variant={selected ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-10 w-10 text-slate-600 hover:text-slate-900",
                    selected && "text-primary-foreground hover:text-primary-foreground bg-primary hover:bg-primary/90 shadow-md ring-2 ring-primary/20 ring-offset-2"
                  )}
                  onClick={() => onChange(name)}
                  title={name}
                >
                  <Icon className="h-5 w-5" />
                  <span className="sr-only">{name}</span>
                </Button>
              );
            })}
          </div>
        )}
      </ScrollArea>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {iconList.length} icons available
        </p>
        {value && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-md">
            Selected: {value}
          </div>
        )}
      </div>
    </div>
  );
}
