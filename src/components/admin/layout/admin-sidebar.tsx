"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    Database,
    AppWindow,
    Users,
    Shield,
    ArrowLeft,
    Command,
    Inbox,
    ListChecks,
    Share2,
    Copy
} from "lucide-react";
import { LogoutButton } from "@/components/shared/logout-button";

export function AdminSidebar() {
    const pathname = usePathname();
    const hideSidebar = pathname.includes("/admin/objects/") && pathname.includes("/record-pages/");

    if (hideSidebar) return null;

    return (
        <aside className="pb-12 w-64 bg-sidebar text-sidebar-foreground h-screen sticky top-0 hidden md:flex flex-col border-r border-sidebar-border transition-all duration-300">
            {/* Header / Brand */}
            <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
                <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                    <div className="bg-sidebar-primary rounded-lg p-1.5 text-sidebar-primary-foreground">
                        <Command className="w-5 h-5" />
                    </div>
                    <span>openCRM</span>
                    <span className="text-xs font-normal text-sidebar-foreground/70 ml-1 py-0.5 px-1.5 bg-sidebar-accent rounded">
                        Admin
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname === "/admin" && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Dashboard
                    </Link>
                </Button>

                {/* Section: Object Management */}
                <div className="pt-4 pb-2 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    Object Management
                </div>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/objects") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/objects">
                        <Database className="mr-2 h-4 w-4" />
                        Object Manager
                    </Link>
                </Button>

                {/* Section: Access Control */}
                <div className="pt-4 pb-2 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    Access Control
                </div>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/users") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/users">
                        <Users className="mr-2 h-4 w-4" />
                        Users
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/queues") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/queues">
                        <Inbox className="mr-2 h-4 w-4" />
                        Queues
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/groups") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/groups">
                        <Users className="mr-2 h-4 w-4" />
                        Groups
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/assignment-rules") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/assignment-rules">
                        <ListChecks className="mr-2 h-4 w-4" />
                        Assignment Rules
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/sharing-rules") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/sharing-rules">
                        <Share2 className="mr-2 h-4 w-4" />
                        Sharing Rules
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start pl-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/duplicate-rules") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/duplicate-rules">
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate Rules
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/permissions") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/permissions">
                        <Shield className="mr-2 h-4 w-4" />
                        Permission Sets
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/permission-groups") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/permission-groups">
                        <Users className="mr-2 h-4 w-4" />
                        Permission Groups
                    </Link>
                </Button>


                {/* Section: Platform */}
                <div className="pt-4 pb-2 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    Platform
                </div>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        pathname.startsWith("/admin/apps") && "bg-sidebar-accent text-sidebar-foreground font-medium"
                    )}
                    asChild
                >
                    <Link href="/admin/apps">
                        <AppWindow className="mr-2 h-4 w-4" />
                        App Builder
                    </Link>
                </Button>
            </nav>

            {/* Footer / Profile */}
            <div className="p-4 border-t border-sidebar-border space-y-2">
                <Button
                    variant="ghost"
                    className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    asChild
                >
                    <Link href="/app/dashboard">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to App
                    </Link>
                </Button>
                <div className="pt-2">
                    <LogoutButton />
                </div>
            </div>
        </aside>
    );
}
