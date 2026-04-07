"use client";

import { useState, useEffect } from "react";
import { UserNav } from "@/components/shared/user-nav";
import { usePathname } from "next/navigation";

interface AdminHeaderProps {
    user: any;
}

export function AdminHeader({ user }: AdminHeaderProps) {
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const getPageTitle = (path: string) => {
        if (path === "/admin") return "Dashboard";
        if (path.startsWith("/admin/objects")) return "Object Manager";
        if (path.startsWith("/admin/users")) return "User Management";
        if (path.startsWith("/admin/permissions")) return "Permission Sets";
        if (path.startsWith("/admin/apps")) return "App Builder";
        return "Admin Console";
    };

    if (!isMounted) {
        return (
            <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 flex-shrink-0 z-10 sticky top-0">
                <div className="font-semibold text-lg">Admin Console</div>
            </header>
        );
    }

    return (
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 flex-shrink-0 z-10 sticky top-0">
            <div className="font-bold text-xl text-foreground">
                {getPageTitle(pathname)}
            </div>

            <div className="flex items-center gap-4">
                <div className="h-6 w-px bg-border hidden md:block"></div>
                <UserNav user={user} />
            </div>
        </header>
    );
}
