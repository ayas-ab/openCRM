"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    AppWindow,
    ArrowLeft,
    Command,
    Copy,
    Database,
    Inbox,
    LayoutDashboard,
    ListChecks,
    Share2,
    Shield,
    Users,
} from "lucide-react";
import { LogoutButton } from "@/components/shared/logout-button";

type AdminNavItem = {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    match: (pathname: string) => boolean;
    indent?: boolean;
};

type AdminNavSection = {
    label?: string;
    items: AdminNavItem[];
};

const adminNavSections: AdminNavSection[] = [
    {
        items: [
            {
                href: "/admin",
                label: "Dashboard",
                icon: LayoutDashboard,
                match: (pathname) => pathname === "/admin",
            },
        ],
    },
    {
        label: "Object Management",
        items: [
            {
                href: "/admin/objects",
                label: "Object Manager",
                icon: Database,
                match: (pathname) => pathname.startsWith("/admin/objects"),
            },
        ],
    },
    {
        label: "Access Control",
        items: [
            {
                href: "/admin/users",
                label: "Users",
                icon: Users,
                match: (pathname) => pathname.startsWith("/admin/users"),
            },
            {
                href: "/admin/queues",
                label: "Queues",
                icon: Inbox,
                match: (pathname) => pathname.startsWith("/admin/queues"),
            },
            {
                href: "/admin/groups",
                label: "Groups",
                icon: Users,
                match: (pathname) => pathname.startsWith("/admin/groups"),
            },
            {
                href: "/admin/assignment-rules",
                label: "Assignment Rules",
                icon: ListChecks,
                match: (pathname) => pathname.startsWith("/admin/assignment-rules"),
            },
            {
                href: "/admin/sharing-rules",
                label: "Sharing Rules",
                icon: Share2,
                match: (pathname) => pathname.startsWith("/admin/sharing-rules"),
            },
            {
                href: "/admin/duplicate-rules",
                label: "Duplicate Rules",
                icon: Copy,
                match: (pathname) => pathname.startsWith("/admin/duplicate-rules"),
                indent: true,
            },
            {
                href: "/admin/permissions",
                label: "Permission Sets",
                icon: Shield,
                match: (pathname) => pathname.startsWith("/admin/permissions"),
            },
            {
                href: "/admin/permission-groups",
                label: "Permission Groups",
                icon: Users,
                match: (pathname) => pathname.startsWith("/admin/permission-groups"),
            },
        ],
    },
    {
        label: "Platform",
        items: [
            {
                href: "/admin/apps",
                label: "App Builder",
                icon: AppWindow,
                match: (pathname) => pathname.startsWith("/admin/apps"),
            },
        ],
    },
];

export function getAdminPageTitle(pathname: string) {
    if (pathname === "/admin") return "Dashboard";
    if (pathname.startsWith("/admin/objects")) return "Object Manager";
    if (pathname.startsWith("/admin/users")) return "User Management";
    if (pathname.startsWith("/admin/queues")) return "Queues";
    if (pathname.startsWith("/admin/groups")) return "Groups";
    if (pathname.startsWith("/admin/assignment-rules")) return "Assignment Rules";
    if (pathname.startsWith("/admin/sharing-rules")) return "Sharing Rules";
    if (pathname.startsWith("/admin/duplicate-rules")) return "Duplicate Rules";
    if (pathname.startsWith("/admin/permissions")) return "Permission Sets";
    if (pathname.startsWith("/admin/permission-groups")) return "Permission Groups";
    if (pathname.startsWith("/admin/apps")) return "App Builder";
    return "Admin Console";
}

function AdminNavContent({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
    return (
        <>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
                {adminNavSections.map((section) => (
                    <div key={section.label ?? "root"} className="space-y-1">
                        {section.label ? (
                            <div className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                                {section.label}
                            </div>
                        ) : null}
                        {section.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = item.match(pathname);

                            return (
                                <Button
                                    key={item.href}
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                        item.indent ? "pl-9" : "",
                                        isActive && "bg-sidebar-accent text-sidebar-foreground font-medium"
                                    )}
                                    asChild
                                >
                                    <Link href={item.href}>
                                        <Icon className={cn("h-4 w-4", mobile ? "mr-3" : "mr-2")} />
                                        {item.label}
                                    </Link>
                                </Button>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="space-y-2 border-t border-sidebar-border p-4">
                <Button
                    variant="ghost"
                    className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
        </>
    );
}

export function AdminSidebar() {
    const pathname = usePathname();
    const hideSidebar = pathname.includes("/admin/objects/") && pathname.includes("/record-pages/");

    if (hideSidebar) return null;

    return (
        <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar pb-12 text-sidebar-foreground transition-all duration-300 md:flex">
            <div className="flex h-16 items-center border-b border-sidebar-border px-6">
                <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
                    <div className="rounded-lg bg-sidebar-primary p-1.5 text-sidebar-primary-foreground">
                        <Command className="h-5 w-5" />
                    </div>
                    <span>openCRM</span>
                    <span className="ml-1 rounded bg-sidebar-accent px-1.5 py-0.5 text-xs font-normal text-sidebar-foreground/70">
                        Admin
                    </span>
                </div>
            </div>
            <AdminNavContent pathname={pathname} />
        </aside>
    );
}

export function AdminMobileNav() {
    const pathname = usePathname();

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex h-16 items-center border-b border-sidebar-border px-5">
                <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
                    <div className="rounded-lg bg-sidebar-primary p-1.5 text-sidebar-primary-foreground">
                        <Command className="h-5 w-5" />
                    </div>
                    <span>openCRM</span>
                    <span className="ml-1 rounded bg-sidebar-accent px-1.5 py-0.5 text-xs font-normal text-sidebar-foreground/70">
                        Admin
                    </span>
                </div>
            </div>
            <AdminNavContent pathname={pathname} mobile />
        </div>
    );
}
