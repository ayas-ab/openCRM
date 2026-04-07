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
import { Users } from "lucide-react";
import { CreatePermissionGroupDialog } from "@/components/admin/permissions/create-permission-group-dialog";

export default async function PermissionGroupsPage() {
    const session = await auth();
    if (!session?.user) return null;
    const user = session.user as any;
    const organizationId = parseInt(user.organizationId);

    const groups = await db.permissionSetGroup.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
            _count: {
                select: { permissionSets: true },
            },
        },
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Permission Set Groups</h1>
                    <p className="text-muted-foreground">
                        Bundle multiple permission sets together for easier assignment.
                    </p>
                </div>
                <CreatePermissionGroupDialog />
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Permission Sets</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groups.map((group) => (
                            <TableRow key={group.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        {group.name}
                                    </div>
                                </TableCell>
                                <TableCell>{group.description}</TableCell>
                                <TableCell>{group._count.permissionSets}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/admin/permission-groups/${group.id}`}>
                                            Manage
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {groups.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No permission set groups found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
