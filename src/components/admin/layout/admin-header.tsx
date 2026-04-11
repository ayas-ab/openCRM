"use client";

import { useState, useEffect } from "react";
import { UserNav } from "@/components/shared/user-nav";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { AdminMobileNav, getAdminPageTitle } from "@/components/admin/layout/admin-sidebar";

interface AdminHeaderProps {
    user: any;
}

export function AdminHeader({ user }: AdminHeaderProps) {
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-4 md:px-6">
                <div className="font-semibold text-lg">Admin Console</div>
            </header>
        );
    }

    return (
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-4 md:px-6">
            <div className="flex items-center gap-3">
                <div className="md:hidden">
                    <Drawer direction="left">
                        <DrawerTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Open admin navigation">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </DrawerTrigger>
                        <DrawerContent className="p-0" aria-describedby="admin-mobile-nav-description">
                            <div className="sr-only">
                                <DrawerTitle>Admin navigation</DrawerTitle>
                                <DrawerDescription id="admin-mobile-nav-description">
                                    Browse admin pages and account actions.
                                </DrawerDescription>
                            </div>
                            <AdminMobileNav />
                        </DrawerContent>
                    </Drawer>
                </div>
                <div className="font-bold text-lg text-foreground md:text-xl">
                    {getAdminPageTitle(pathname)}
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden h-6 w-px bg-border md:block"></div>
                <UserNav user={user} />
            </div>
        </header>
    );
}
