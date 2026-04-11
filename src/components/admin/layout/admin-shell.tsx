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
                <div className="flex min-w-0 flex-1 flex-col">
                    <AdminHeader user={user} />
                    <main className="flex-1 bg-muted/10 p-4 md:p-6">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
