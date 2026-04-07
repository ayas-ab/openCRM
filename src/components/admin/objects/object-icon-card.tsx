"use client";

import { useState, useTransition } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker } from "./icon-picker";
import { updateObjectIdentity } from "@/actions/admin/admin-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

function getIconComponent(name?: string) {
  return name ? ((Icons as any)[name] as React.ComponentType<{ className?: string }>) : undefined;
}

interface ObjectIconCardProps {
  objectId: number;
  currentIcon?: string | null;
  label: string;
  pluralLabel: string;
  description?: string | null;
  notifyOnAssignment: boolean;
  enableChatter: boolean;
  isUserObject?: boolean;
}

export function ObjectIconCard({
  objectId,
  currentIcon,
  label,
  pluralLabel,
  description,
  notifyOnAssignment,
  enableChatter,
  isUserObject = false,
}: ObjectIconCardProps) {
  const [icon, setIcon] = useState<string>(currentIcon || "Box");
  const [name, setName] = useState<string>(label);
  const [plural, setPlural] = useState<string>(pluralLabel);
  const [desc, setDesc] = useState<string>(description || "");
  const [notify, setNotify] = useState<boolean>(notifyOnAssignment);
  const [chatterEnabled, setChatterEnabled] = useState<boolean>(enableChatter);
  const [isPending, startTransition] = useTransition();

  const Icon = getIconComponent(icon) || Icons.Box;

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!plural.trim()) {
      toast.error("Plural Label is required");
      return;
    }
        startTransition(async () => {
          const result = await updateObjectIdentity({
            objectDefId: objectId,
            icon,
            label: name,
            pluralLabel: plural,
            description: desc,
            notifyOnAssignment: notify,
            enableChatter: chatterEnabled
          });
      if (result.success) {
        toast.success("Object identity updated successfully");
      } else {
        toast.error(result.error || "Failed to update object");
      }
    });
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="border-b bg-slate-50/50 py-4">
        <CardTitle className="text-base font-medium">General Settings</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label>Object Name (Singular)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project"
            />
          </div>

          <div className="space-y-2">
            <Label>Object Name (Plural)</Label>
            <Input
              value={plural}
              onChange={(e) => setPlural(e.target.value)}
              placeholder="e.g. Projects"
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{icon}</span>
                  </div>
                  <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-4" align="start">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-medium leading-none">Select Icon</h4>
                    <p className="text-xs text-muted-foreground">
                      Choose an icon to represent this object.
                    </p>
                  </div>
                  <Separator />
                  <IconPicker value={icon} onChange={setIcon} />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe what this object is used for..."
            className="resize-none min-h-[90px]"
          />
        </div>

        {!isUserObject ? (
          <>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <Label className="text-sm font-medium">Notify users on assignment</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, users receive a notification if they are assigned a record in this object.
                </p>
              </div>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <Label className="text-sm font-medium">Enable chatter</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Show a comments panel on records so users can discuss and request changes.
                </p>
              </div>
              <Switch checked={chatterEnabled} onCheckedChange={setChatterEnabled} />
            </div>
          </>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <Button onClick={handleSave} disabled={isPending} className="sm:w-auto w-full">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
