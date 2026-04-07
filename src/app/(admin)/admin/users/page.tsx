import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { User, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InviteUserDialog } from "@/components/admin/users/invite-user-dialog";

export default async function UsersPage() {
    const session = await auth();
    if (!session?.user) return null;
    const organizationId = Number(session.user.organizationId ?? NaN);

    const users = await db.user.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
            permissionAssignments: {
                include: {
                    permissionSet: true,
                },
            },
        },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                    <p className="text-muted-foreground">
                        Manage users and their access permissions.
                    </p>
                </div>
                <InviteUserDialog />
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Permission Sets</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex flex-col">
                                            <span>{user.name || "Unnamed User"}</span>
                                            <span className="text-xs text-muted-foreground">@{user.username}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.userType === "admin" ? "default" : "secondary"}>
                                        {user.userType}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {user.permissionAssignments.map((assign) => (
                                            <Badge key={assign.id} variant="outline" className="text-xs">
                                                {assign.permissionSet.name}
                                            </Badge>
                                        ))}
                                        {user.permissionAssignments.length === 0 && (
                                            <span className="text-muted-foreground text-sm italic">None</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/admin/users/${user.id}`}>
                                            Manage
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
