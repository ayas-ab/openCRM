import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/layout/admin-shell";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const user = session.user as any;
    if (user.userType !== "admin") redirect("/app/dashboard");

    return <AdminShell user={user}>{children}</AdminShell>;
}
