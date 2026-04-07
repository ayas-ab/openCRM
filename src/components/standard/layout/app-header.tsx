"use client";

import { useState, useEffect } from "react";
import { UserNav } from "@/components/shared/user-nav";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/components/standard/layout/global-search";
import Link from "next/link";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsMenu } from "@/components/standard/layout/notifications-menu";
import { signOut } from "next-auth/react";

interface AppHeaderProps {
    apps: any[];
    currentAppApiName?: string;
    user: any;
    navItems: any[];
    isAdmin: boolean;
    profileHref?: string;
}

export function AppHeader({ apps, currentAppApiName, user, navItems, isAdmin, profileHref }: AppHeaderProps) {
    const pathname = usePathname();
    const [isMounted, setIsMounted] = useState(false);

    // Only render on client to avoid hydration mismatch with Radix UI IDs
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleAppChange = (value: string) => {
        // Use hard navigation to force layout re-render
        window.location.href = `/app/${value}/dashboard`;
    };

    if (!isMounted) {
        return (
            <header className="sticky top-0 z-20 border-b border-border bg-white">
                <div className="flex h-16 items-center justify-between px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground">
                        <div className="bg-primary rounded-lg p-1.5 shadow-sm text-primary-foreground">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <span>openCRM</span>
                    </div>
                </div>
            </header>
        );
    }

    const defaultAppApiName = currentAppApiName ?? (apps[0]?.apiName ?? null);
    const activeAppApiName = currentAppApiName ?? defaultAppApiName;
    const dashboardHref = activeAppApiName ? `/app/${activeAppApiName}/dashboard` : "/app/dashboard";
    const objectRouteBase = activeAppApiName ? `/app/${activeAppApiName}` : "/app";

    return (
        <header className="sticky top-0 z-20 border-b border-border bg-white">
            <div className="flex h-16 items-center justify-between overflow-visible px-4 md:px-6">
                {/* Left Section: Logo & App Switcher */}
                <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
                    <Link
                        href={defaultAppApiName ? `/app/${defaultAppApiName}/dashboard` : "/app/dashboard"}
                        className="flex shrink-0 items-center gap-2 font-bold text-xl tracking-tight text-foreground transition-opacity hover:opacity-80"
                    >
                        <div className="bg-primary rounded-lg p-1.5 shadow-sm text-primary-foreground">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <span>openCRM</span>
                    </Link>

                    <div className="hidden h-6 w-px bg-border lg:block"></div>

                    {/* App Switcher */}
                    <div className="hidden lg:block">
                        <Select value={currentAppApiName} onValueChange={handleAppChange}>
                            <SelectTrigger className="w-[180px] shrink-0 border-none bg-transparent shadow-none font-semibold text-foreground hover:bg-muted/50 focus:ring-0">
                                <SelectValue placeholder="Select App" />
                            </SelectTrigger>
                            <SelectContent>
                                {apps.map((app) => (
                                    <SelectItem key={app.id} value={app.apiName}>
                                        <span className="font-medium">{app.name}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Right Section: Search & Profile */}
                <div className="ml-4 flex shrink-0 items-center gap-3 lg:gap-4">
                    <div className="hidden w-64 lg:block">
                        <GlobalSearch defaultAppApiName={defaultAppApiName} />
                    </div>
                    <NotificationsMenu currentAppApiName={activeAppApiName} />
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="group hidden border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 lg:inline-flex"
                        >
                            <Link href="/admin" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                                <Icons.Settings className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                                <span className="text-xs font-semibold tracking-wide">Setup</span>
                                <Icons.ExternalLink className="h-3.5 w-3.5 opacity-75" />
                            </Link>
                        </Button>
                    )}
                    <div className="hidden lg:block">
                        <UserNav user={user} profileHref={profileHref} />
                    </div>
                    <div className="lg:hidden">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9">
                                    <Icons.Menu className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-[80vh] w-80 overflow-y-auto">
                                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                                <div className="px-2 pb-2">
                                    <GlobalSearch defaultAppApiName={defaultAppApiName} />
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Switch App</DropdownMenuLabel>
                                {apps.map((app) => (
                                    <DropdownMenuItem key={app.id} asChild>
                                        <Link
                                            href={`/app/${app.apiName}/dashboard`}
                                            className={cn(
                                                "flex w-full items-center justify-between gap-2",
                                                activeAppApiName === app.apiName && "font-semibold text-primary"
                                            )}
                                        >
                                            <span className="truncate">{app.name}</span>
                                            {activeAppApiName === app.apiName ? (
                                                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                                            ) : null}
                                        </Link>
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Objects</DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                    <Link
                                        href={dashboardHref}
                                        className={cn(
                                            "flex w-full items-center justify-between gap-2",
                                            pathname === dashboardHref && "font-semibold text-primary"
                                        )}
                                    >
                                        <span className="flex items-center gap-2">
                                            <Icons.LayoutDashboard className="h-4 w-4" />
                                            Dashboard
                                        </span>
                                        {pathname === dashboardHref ? (
                                            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                                        ) : null}
                                    </Link>
                                </DropdownMenuItem>
                                {navItems.map((item) => {
                                    const href = `${objectRouteBase}/${item.objectDef.apiName}`;
                                    const isActive = pathname.startsWith(href);
                                    const ObjectIcon = (Icons as any)[item.objectDef.icon || "Box"] || Icons.Box;
                                    return (
                                        <DropdownMenuItem key={item.id} asChild>
                                            <Link
                                                href={href}
                                                className={cn(
                                                    "flex w-full items-center justify-between gap-2",
                                                    isActive && "font-semibold text-primary"
                                                )}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <ObjectIcon className="h-4 w-4 shrink-0" />
                                                    <span className="truncate">{item.objectDef.pluralLabel}</span>
                                                </span>
                                                {isActive ? (
                                                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                                                ) : null}
                                            </Link>
                                        </DropdownMenuItem>
                                    );
                                })}
                                <DropdownMenuSeparator />
                                {isAdmin ? (
                                    <DropdownMenuItem asChild>
                                        <Link href="/admin" target="_blank" rel="noopener noreferrer">
                                            <Icons.Settings className="mr-2 h-4 w-4" />
                                            Setup
                                        </Link>
                                    </DropdownMenuItem>
                                ) : null}
                                {profileHref ? (
                                    <DropdownMenuItem asChild>
                                        <Link href={profileHref}>
                                            <Icons.User className="mr-2 h-4 w-4" />
                                            Profile
                                        </Link>
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                                    <Icons.LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </header>
    );
}
