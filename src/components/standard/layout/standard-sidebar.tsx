"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { LayoutDashboard } from "lucide-react";

interface StandardSidebarProps {
    currentAppApiName: string;
    navItems: Array<{
        id: number;
        objectDef: {
            apiName: string;
            pluralLabel: string;
            icon?: string | null;
        };
    }>;
}

export function StandardSidebar({ currentAppApiName, navItems }: StandardSidebarProps) {
    const pathname = usePathname();
    const dashboardHref = `/app/${currentAppApiName}/dashboard`;
    const objectRouteBase = `/app/${currentAppApiName}`;

    return (
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 self-start border-r border-border/80 bg-white lg:flex">
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Navigation</p>
                </div>
                <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
                    <Link
                        href={dashboardHref}
                        className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            pathname === dashboardHref
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Dashboard</span>
                    </Link>
                    {navItems.map((item) => {
                        const href = `${objectRouteBase}/${item.objectDef.apiName}`;
                        const isActive = pathname.startsWith(href);
                        const Icon = (Icons as any)[item.objectDef.icon || "Box"] || Icons.Box;
                        return (
                            <Link
                                key={item.id}
                                href={href}
                                className={cn(
                                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="truncate">{item.objectDef.pluralLabel}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}
