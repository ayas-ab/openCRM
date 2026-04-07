import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getFieldDisplayValue } from "@/lib/field-data";
import { applyLayoutVisibility, normalizeRecordPageLayoutConfig, type LayoutConfigV2 } from "@/lib/record-page-layout";
import { USER_OBJECT_API_NAME } from "@/lib/user-companion";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, User as UserIcon } from "lucide-react";
import { AssignGroupDialog } from "@/components/admin/users/assign-group-dialog";
import { AssignPermissionSetDialog } from "@/components/admin/users/assign-permission-set-dialog";
import { ManagedUserProfileForm } from "@/components/admin/users/managed-user-profile-form";
import { AddUserQueueMembershipDialog } from "@/components/admin/users/add-user-queue-membership-dialog";
import { RemovePermissionAssignmentButton } from "@/components/admin/users/remove-permission-assignment-button";
import { RemoveQueueMemberButton } from "@/components/admin/queues/remove-queue-member-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) return null;

    const organizationId = parseInt((session.user as any).organizationId);
    const { id } = await params;
    const userId = parseInt(id, 10);

    if (Number.isNaN(userId)) notFound();

    const user = await db.user.findUnique({
        where: { id: userId, organizationId },
        include: {
            group: true,
            queueMemberships: {
                include: {
                    queue: true,
                },
                orderBy: {
                    queue: {
                        name: "asc",
                    },
                },
            },
            permissionAssignments: {
                include: {
                    permissionSet: true,
                    sources: {
                        include: {
                            permissionSetGroup: true,
                        },
                    },
                },
            },
            permissionSetGroupAssignments: {
                include: {
                    permissionSetGroup: {
                        include: {
                            permissionSets: {
                                select: { permissionSetId: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) notFound();

    const [groups, companionRecord] = await Promise.all([
        db.group.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),
        db.record.findFirst({
            where: {
                organizationId,
                backingUserId: user.id,
                objectDef: { apiName: USER_OBJECT_API_NAME },
            },
            include: {
                objectDef: {
                    include: {
                        fields: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                            orderBy: { createdAt: "asc" },
                        },
                    },
                },
                createdBy: {
                    select: { name: true, email: true },
                },
                owner: {
                    select: { name: true, email: true },
                },
                fields: {
                    include: {
                        fieldDef: {
                            include: {
                                picklistOptions: { orderBy: { sortOrder: "asc" } },
                            },
                        },
                        valuePicklist: true,
                    },
                },
            },
        }),
    ]);

    const existingIds = user.permissionAssignments.map((pa: any) => pa.permissionSetId);
    const availablePermissionSets = await db.permissionSet.findMany({
        where: {
            organizationId,
            id: { notIn: existingIds },
        },
        orderBy: { name: "asc" },
    });

    const assignedGroups = user.permissionSetGroupAssignments
        .map((assignment) => assignment.permissionSetGroup)
        .sort((a, b) => a.name.localeCompare(b.name));

    const assignedGroupIds = assignedGroups.map((group) => group.id);
    const availableGroups = await db.permissionSetGroup.findMany({
        where: { organizationId, id: { notIn: assignedGroupIds } },
        orderBy: { name: "asc" },
    });

    const currentQueueIds = user.queueMemberships.map((membership) => membership.queueId);
    const availableQueues = await db.queue.findMany({
        where: {
            organizationId,
            id: { notIn: currentQueueIds },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    let lookupResolutions: Record<string, { id: number; name: string; objectApiName: string }> = {};
    let profileLayoutConfig: LayoutConfigV2 | null = null;

    const flattenedCompanionRecord: (Record<string, unknown> & {
        id: number;
        name: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        ownerName: string;
        backingUserId: number | null;
    }) | null = companionRecord
        ? {
            id: companionRecord.id,
            name: companionRecord.name,
            createdAt: companionRecord.createdAt,
            updatedAt: companionRecord.updatedAt,
            createdByName:
                companionRecord.createdBy.name ||
                companionRecord.createdBy.email ||
                `User #${companionRecord.createdById}`,
            ownerName:
                companionRecord.owner?.name ||
                companionRecord.owner?.email ||
                `User #${companionRecord.ownerId}`,
            backingUserId: companionRecord.backingUserId,
            ...Object.fromEntries(
                companionRecord.fields.map((fieldData) => [
                    fieldData.fieldDef.apiName,
                    fieldData.fieldDef.type === "Picklist"
                        ? fieldData.valuePicklistId ?? null
                        : getFieldDisplayValue(fieldData),
                ])
            ),
        }
        : null;

    if (companionRecord && flattenedCompanionRecord) {
        const fileFields = companionRecord.objectDef.fields.filter((field) => field.type === "File");
        if (fileFields.length > 0) {
            const fileAttachmentDelegate = (db as any).fileAttachment;
            if (fileAttachmentDelegate?.findMany) {
                const attachments = await fileAttachmentDelegate.findMany({
                    where: { organizationId, recordId: companionRecord.id },
                    select: {
                        id: true,
                        fieldDefId: true,
                        displayName: true,
                        filename: true,
                        mimeType: true,
                        size: true,
                    },
                });

                const attachmentMap = new Map<number, (typeof attachments)[number]>(
                    attachments.map((attachment: any) => [attachment.fieldDefId, attachment])
                );

                fileFields.forEach((field) => {
                    const attachment = attachmentMap.get(field.id);
                    flattenedCompanionRecord[field.apiName] = attachment
                        ? {
                            id: attachment.id,
                            displayName: attachment.displayName,
                            filename: attachment.filename,
                            mimeType: attachment.mimeType,
                            size: attachment.size,
                            downloadUrl: `/api/files/${attachment.id}`,
                        }
                        : null;
                });
            }
        }

        const lookupEntries = companionRecord.fields.filter(
            (fieldData) => fieldData.fieldDef.type === "Lookup" && fieldData.valueLookup
        );

        if (lookupEntries.length > 0) {
            const lookupRecords = await db.record.findMany({
                where: {
                    organizationId,
                    id: { in: lookupEntries.map((fieldData) => fieldData.valueLookup!).filter(Boolean) },
                },
                select: {
                    id: true,
                    name: true,
                    objectDef: {
                        select: { apiName: true },
                    },
                },
            });

            const lookupMap = new Map(lookupRecords.map((record) => [record.id, record]));
            lookupResolutions = Object.fromEntries(
                lookupEntries
                    .map((fieldData) => {
                        const lookup = lookupMap.get(fieldData.valueLookup!);
                        if (!lookup) return null;
                        return [
                            fieldData.fieldDef.apiName,
                            {
                                id: lookup.id,
                                name: lookup.name || `Record #${lookup.id}`,
                                objectApiName: lookup.objectDef.apiName,
                            },
                        ];
                    })
                    .filter(Boolean) as Array<[string, { id: number; name: string; objectApiName: string }]>
            );
        }

        const defaultLayoutRow = await db.recordPageLayout.findFirst({
            where: {
                organizationId,
                objectDefId: companionRecord.objectDef.id,
                isDefault: true,
            },
        });

        if (defaultLayoutRow) {
            const normalized = normalizeRecordPageLayoutConfig(
                defaultLayoutRow.config as any,
                companionRecord.objectDef.fields.map((field) => ({
                    id: field.id,
                    required: field.required,
                    type: field.type,
                }))
            );

            profileLayoutConfig = applyLayoutVisibility(normalized, {
                recordValues: flattenedCompanionRecord,
                ownerGroupId: user.groupId ?? null,
                permissionSetIds: existingIds,
                fields: companionRecord.objectDef.fields.map((field) => ({
                    id: field.id,
                    apiName: field.apiName,
                    type: field.type,
                })),
            });
        }
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/users">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{user.name || `User #${user.id}`}</h1>
                    <p className="text-muted-foreground">
                        {user.email || "No email"} · @{user.username} ·{" "}
                        <Badge variant="outline">{user.userType}</Badge>
                    </p>
                </div>
            </div>

            <Card>
                <CardContent>
                    {companionRecord && flattenedCompanionRecord ? (
                        <ManagedUserProfileForm
                            user={{
                                id: user.id,
                                name: user.name,
                                username: user.username,
                                email: user.email,
                                userType: user.userType,
                                groupId: user.groupId,
                            }}
                            groups={groups}
                            companionRecord={companionRecord}
                            flattenedCompanionRecord={flattenedCompanionRecord}
                            layoutConfig={profileLayoutConfig}
                            lookupResolutions={lookupResolutions}
                        />
                    ) : (
                        <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                            No companion user record was found for this user.
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Queue Memberships</h2>
                    <AddUserQueueMembershipDialog
                        userId={user.id}
                        queues={availableQueues.map((queue) => ({
                            id: String(queue.id),
                            label: queue.name,
                        }))}
                    />
                </div>

                <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Queue</TableHead>
                                <TableHead className="w-[120px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {user.queueMemberships.map((membership) => (
                                <TableRow key={membership.queueId}>
                                    <TableCell className="font-medium">{membership.queue.name}</TableCell>
                                    <TableCell>
                                        <RemoveQueueMemberButton
                                            queueId={membership.queueId}
                                            userId={user.id}
                                            memberName={user.name || `User #${user.id}`}
                                            queueName={membership.queue.name}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {user.queueMemberships.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                                        This user is not in any queues.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Assigned Permission Set Groups</h2>
                    <AssignGroupDialog userId={user.id} availableGroups={availableGroups} />
                </div>

                <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Group Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Permission Sets</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assignedGroups.map((group: any) => (
                                <TableRow key={group.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-blue-500" />
                                            {group.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>{group.description}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{group.permissionSets.length} set(s)</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {assignedGroups.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                                        No groups assigned. Click "Assign Group" to add one.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Individual Permission Sets</h2>
                    {availablePermissionSets.length === 0 ? (
                        <div className="text-sm italic text-muted-foreground">
                            All permission sets are already assigned
                        </div>
                    ) : (
                        <AssignPermissionSetDialog
                            userId={user.id}
                            availablePermissionSets={availablePermissionSets}
                        />
                    )}
                </div>

                <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {user.permissionAssignments.map((assign: any) => {
                                const groupSources = (assign.sources || []).filter(
                                    (source: any) => source.sourceType === "GROUP" && source.permissionSetGroup
                                );
                                const hasDirectSource = (assign.sources || []).some(
                                    (source: any) => source.sourceType === "DIRECT"
                                );

                                return (
                                    <TableRow key={assign.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <UserIcon className="h-4 w-4 text-muted-foreground" />
                                                <div>
                                                    {assign.permissionSet.name}
                                                    {groupSources.length > 0 && (
                                                        <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                                            <span>via group:</span>
                                                            {groupSources.map((source: any) => (
                                                                <Badge
                                                                    key={source.permissionSetGroup.id}
                                                                    variant="secondary"
                                                                    className="text-xs"
                                                                >
                                                                    {source.permissionSetGroup.name}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{assign.permissionSet.description}</TableCell>
                                        <TableCell>
                                            <RemovePermissionAssignmentButton
                                                userId={user.id}
                                                permissionSetId={assign.permissionSetId}
                                                hasDirectSource={hasDirectSource}
                                                groupSourceCount={groupSources.length}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {user.permissionAssignments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                                        No permission sets assigned.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
