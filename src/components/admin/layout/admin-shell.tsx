"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/layout/admin-sidebar";
import { AdminHeader } from "@/components/admin/layout/admin-header";

interface AdminShellProps {
    user: any;
    children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
    const pathname = usePathname();
    const hideChrome = pathname.includes("/admin/apps/") && pathname.includes("/builder");

    if (hideChrome) {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen flex-col">
            <div className="flex flex-1">
                <AdminSidebar />
                <div className="flex-1 flex flex-col">
                    <AdminHeader user={user} />
                    <main className="flex-1 p-6 bg-muted/10">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
