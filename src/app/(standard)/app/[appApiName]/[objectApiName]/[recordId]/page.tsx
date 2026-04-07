import { getRecord } from "@/actions/standard/record-actions";
import { getLookupOptions, getLookupLabel } from "@/actions/standard/lookup-actions";
import { db } from "@/lib/db";
import { RecordForm } from "@/components/standard/record/record-form";
import { RecordDetail } from "@/components/standard/record/record-detail";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { auth } from "@/auth";
import { OwnerType } from "@prisma/client";
import { checkPermission } from "@/lib/permissions";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";
import { LayoutConfigV2, normalizeRecordPageLayoutConfig, applyLayoutVisibility } from "@/lib/record-page-layout";
import type { RecordCommentItem } from "@/components/standard/record/record-comment-panel";
import { USER_ID_FIELD_API_NAME, USER_OBJECT_API_NAME } from "@/lib/user-companion";

export default async function RecordPage({
    params,
}: {
    params: Promise<{ appApiName: string; objectApiName: string; recordId: string }>;
}) {
    const { appApiName, objectApiName, recordId } = await params;
    const isNew = recordId === "new";
    const session = await auth();
    const userId = parseInt(session?.user?.id as string);
    const organizationId = parseInt((session?.user as any)?.organizationId);
    const app = await db.appDefinition.findUnique({
        where: {
            organizationId_apiName: {
                organizationId,
                apiName: appApiName,
            },
        },
        select: { id: true, apiName: true },
    });

    if (!app) {
        notFound();
    }

    let objectDef;
    let record = null;
    let lookupResolutions = {};
    let relatedLists: any[] = [];
    let historyEntries: any[] = [];
    let historyLookupLabels: Record<number, string> = {};
    let layoutConfig: LayoutConfigV2 | null = null;
    let layoutConfigRaw: LayoutConfigV2 | null = null;
    let layoutName: string | null = null;
    let canEditRecord = true;
    let canDeleteRecord = false;
    let canClaim = false;
    let queueOptions: { id: string; label: string }[] = [];
    let layoutAssignments: {
        id: number;
        permissionSetId?: number | null;
        layout: { id: number; name: string; config: any };
    }[] = [];
    let defaultLayout: { id: number; name: string; config: any } | null = null;
    let permissionSetIdList: number[] = [];
    let ownerGroupId: number | null = null;
    let enableChatter = false;
    let comments: RecordCommentItem[] = [];
    let mentionCandidates: { id: number; name: string; username: string }[] = [];
    let blockedFieldApiNames: string[] = [];
    let submitMode: "default" | "ownUserRecord" = "default";
    let systemInfoItems: { label: string; value: string }[] = [];

    if (isNew) {
        // Fetch just the definition
        objectDef = await db.objectDefinition.findUnique({
            where: {
                organizationId_apiName: {
                    organizationId,
                    apiName: objectApiName,
                },
            },
            include: {
                fields: {
                    include: {
                        picklistOptions: { orderBy: { sortOrder: "asc" } },
                    },
                },
            },
        });

        if (objectDef) {
            const permissionSetIds = await db.permissionSetAssignment.findMany({
                where: { userId },
                select: { permissionSetId: true },
            });
            permissionSetIdList = permissionSetIds.map((item) => item.permissionSetId);
            ownerGroupId = (await db.user.findUnique({
                where: { id: userId },
                select: { groupId: true },
            }))?.groupId ?? null;

            const assignments = await db.recordPageAssignment.findMany({
                where: {
                    organizationId,
                    objectDefId: objectDef.id,
                    appId: app.id,
                },
                include: {
                    layout: true,
                },
            });

            layoutAssignments = assignments.map((assignment) => ({
                id: assignment.id,
                permissionSetId: assignment.permissionSetId,
                layout: {
                    id: assignment.layout.id,
                    name: assignment.layout.name,
                    config: assignment.layout.config,
                },
            }));

            const defaultLayoutRow = await db.recordPageLayout.findFirst({
                where: {
                    organizationId,
                    objectDefId: objectDef.id,
                    isDefault: true,
                },
            });

            defaultLayout = defaultLayoutRow
                ? {
                    id: defaultLayoutRow.id,
                    name: defaultLayoutRow.name,
                    config: defaultLayoutRow.config,
                }
                : null;
        }
    } else {
        // Fetch existing record
        const result = await getRecord(objectApiName, parseInt(recordId));

        if (!result || !result.success) {
            if (result?.error === "ACCESS_DENIED" || result?.error === "INSUFFICIENT_PERMISSIONS") {
                return (
                    <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center space-y-6">
                        <div className="bg-destructive/10 p-6 rounded-full">
                            <ShieldAlert className="h-12 w-12 text-destructive" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
                            <p className="text-muted-foreground max-w-md mx-auto">
                                You do not have permission to view this record. Please contact your administrator if you believe this is an error.
                            </p>
                        </div>
                        <Button asChild variant="outline">
                            <Link href={`/app/${appApiName}/${objectApiName}`}>Back to List</Link>
                        </Button>
                    </div>
                );
            }
            return notFound();
        }

        record = result.record;
        objectDef = result.objectDef;
        if (!objectDef) {
            return notFound();
        }
        enableChatter = Boolean(objectDef.enableChatter);
        lookupResolutions = result.lookupResolutions || {};
        relatedLists = result.relatedLists || [];
        historyEntries = result.historyEntries || [];
        historyLookupLabels = result.historyLookupLabels || {};

        const queueIds = await getUserQueueIds(userId);
        const userGroupId = (await db.user.findUnique({
            where: { id: userId },
            select: { groupId: true },
        }))?.groupId ?? null;
        const canModifyAll = await checkPermission(userId, organizationId, objectApiName, "modifyAll");
        const canEditPermission = canModifyAll ? true : await checkPermission(userId, organizationId, objectApiName, "edit");
        const canDeletePermission = canModifyAll ? true : await checkPermission(userId, organizationId, objectApiName, "delete");
        const isUserObject = objectApiName === USER_OBJECT_API_NAME;
        const isOwnUserRecord = isUserObject && record.backingUserId === userId;

        if (isOwnUserRecord) {
            canEditRecord = true;
            submitMode = "ownUserRecord";
            blockedFieldApiNames = [USER_ID_FIELD_API_NAME];
        } else if (canModifyAll) {
            canEditRecord = true;
        } else if (canEditPermission) {
            const editFilter = buildRecordAccessFilter(userId, queueIds, userGroupId, "edit");
            const editable = await db.record.findFirst({
                where: {
                    id: record.id,
                    organizationId,
                    ...(editFilter ?? {}),
                },
                select: { id: true },
            });
            canEditRecord = Boolean(editable);
        } else {
            canEditRecord = false;
        }

        if (isUserObject) {
            canDeleteRecord = false;
        } else if (canModifyAll) {
            canDeleteRecord = true;
        } else if (canDeletePermission) {
            const deleteFilter = buildRecordAccessFilter(userId, queueIds, userGroupId, "delete");
            const deletable = await db.record.findFirst({
                where: {
                    id: record.id,
                    organizationId,
                    ...(deleteFilter ?? {}),
                },
                select: { id: true },
            });
            canDeleteRecord = Boolean(deletable);
        } else {
            canDeleteRecord = false;
        }

        canClaim = !isUserObject && Boolean(
            record.ownerType === OwnerType.QUEUE &&
                record.ownerQueueId &&
                queueIds.includes(record.ownerQueueId) &&
                canEditPermission
        );

        if (isUserObject && record.backingUserId) {
            const backingUser = await db.user.findFirst({
                where: { id: record.backingUserId, organizationId },
                include: {
                    queueMemberships: {
                        include: {
                            queue: { select: { name: true } },
                        },
                    },
                    group: { select: { name: true } },
                },
            });

            if (backingUser) {
                systemInfoItems = [
                    { label: "Email", value: backingUser.email || "-" },
                    { label: "Username", value: backingUser.username || "-" },
                    {
                        label: "Queues",
                        value:
                            backingUser.queueMemberships.map((membership) => membership.queue.name).join(", ") || "-",
                    },
                    { label: "Group", value: backingUser.group?.name || "-" },
                ];
            }
        }

        if (app) {
            const permissionSetIds = await db.permissionSetAssignment.findMany({
                where: { userId },
                select: { permissionSetId: true },
            });
            permissionSetIdList = permissionSetIds.map((item) => item.permissionSetId);
            const permissionSetIdSet = new Set(permissionSetIdList);

            const assignments = await db.recordPageAssignment.findMany({
                where: {
                    organizationId,
                    objectDefId: objectDef.id,
                    appId: app.id,
                },
                include: {
                    layout: true,
                },
            });

            const matches = assignments.filter((assignment) => {
                if (assignment.permissionSetId && !permissionSetIdSet.has(assignment.permissionSetId)) {
                    return false;
                }
                return true;
            });

            const scored = matches.map((assignment) => {
                const score = assignment.permissionSetId ? 1 : 0;
                return { assignment, score };
            });

            const selected = scored.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.assignment.id - b.assignment.id;
            })[0]?.assignment;

            const defaultLayout = await db.recordPageLayout.findFirst({
                where: {
                    organizationId,
                    objectDefId: objectDef.id,
                    isDefault: true,
                },
            });

            const chosenLayout = selected?.layout || defaultLayout;
            if (chosenLayout) {
                layoutConfigRaw = normalizeRecordPageLayoutConfig(
                    chosenLayout.config as any,
                    objectDef.fields.map((field) => ({
                        id: field.id,
                        required: field.required,
                        type: field.type,
                    }))
                );
                ownerGroupId =
                    record.ownerType === OwnerType.USER && record.ownerId
                        ? (await db.user.findUnique({
                            where: { id: record.ownerId },
                            select: { groupId: true },
                        }))?.groupId ?? null
                        : null;
                layoutConfig = applyLayoutVisibility(layoutConfigRaw, {
                    recordValues: record,
                    ownerGroupId: ownerGroupId ?? null,
                    permissionSetIds: permissionSetIdList,
                    fields: objectDef.fields.map((field) => ({
                        id: field.id,
                        apiName: field.apiName,
                        type: field.type,
                    })),
                });
            layoutName = chosenLayout.name;
            }
        }

        if (canEditRecord && !isUserObject) {
            const queues = await db.queue.findMany({
                where: { organizationId },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            });
            queueOptions = queues.map(queue => ({
                id: String(queue.id),
                label: queue.name,
            }));
        }

        if (enableChatter) {
            const commentRows = await db.recordComment.findMany({
                where: {
                    organizationId,
                    recordId: record.id,
                    isDeleted: false,
                },
                include: {
                    author: {
                        select: { id: true, name: true, email: true, username: true },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            comments = commentRows.map((comment) => ({
                id: comment.id,
                recordId: comment.recordId,
                authorId: comment.authorId,
                authorName: comment.author.name || comment.author.email || `User #${comment.authorId}`,
                authorUsername: comment.author.username,
                bodyText: comment.bodyText,
                createdAt: comment.createdAt.toISOString(),
                editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
            }));

            const mentionUsers = await db.user.findMany({
                where: { organizationId },
                select: { id: true, name: true, username: true },
                orderBy: { username: "asc" },
            });
            mentionCandidates = mentionUsers.map((user) => ({
                id: user.id,
                name: user.name || `User #${user.id}`,
                username: user.username,
            }));
        }
    }

    if (!objectDef) return notFound();

    // Fetch Lookup Options (needed for Edit mode)
    // Fetch Lookup Options (needed for Edit mode)
    const lookupOptions: Record<string, { id: string; label: string }[]> = {};
    for (const field of objectDef.fields) {
        if (field.type === "Lookup" && field.lookupTargetId) {
            const options = await getLookupOptions(field.lookupTargetId);

            // Check if current record has a value for this field that isn't in the options
            // (e.g. because user doesn't have read access to it generally, but we want to show it)
            if (record && record[field.apiName]) {
                const currentValId = String(record[field.apiName]);
                const exists = options.find(o => o.id === currentValId);

                if (!exists) {
                    const labelData = await getLookupLabel(field.lookupTargetId, parseInt(currentValId));
                    if (labelData) {
                        options.push(labelData);
                    }
                }
            }

            lookupOptions[field.apiName] = options;
        }
    }

    // Fetch Users for Owner Dropdown (only if editing)
    let userOptions: { id: string; label: string }[] = [];
    if (!isNew && canEditRecord) {
        const users = await db.user.findMany({
            where: { organizationId },
            select: { id: true, name: true, email: true, username: true },
            orderBy: { name: "asc" }
        });

        userOptions = users.map(u => ({
            id: String(u.id),
            label: `${u.name || u.email || `User #${u.id}`} (@${u.username})`
        }));
    }

    if (isNew) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        New {objectDef.label}
                    </h1>
                </div>
                <div className="border rounded-lg p-6 bg-white shadow-sm">
                    <RecordForm
                        objectDef={objectDef}
                        record={record}
                        appApiName={appApiName}
                        lookupOptions={lookupOptions}
                        layoutAssignments={layoutAssignments}
                        defaultLayout={defaultLayout}
                        permissionSetIds={permissionSetIdList}
                        ownerGroupId={ownerGroupId}
                    />
                </div>
            </div>
        );
    }

    if (!layoutConfig) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center space-y-6">
                <div className="bg-muted/30 p-6 rounded-full">
                    <ShieldAlert className="h-12 w-12 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">No record page layout</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        An admin has not assigned a record page layout for this app. Choose a default layout or create an assignment to view records here.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href={`/app/${appApiName}/${objectApiName}`}>Back to List</Link>
                </Button>
            </div>
        );
    }

    return (
        <RecordDetail
            objectDef={objectDef}
            record={record}
            appApiName={appApiName}
            lookupResolutions={lookupResolutions}
            relatedLists={relatedLists}
            historyEntries={historyEntries}
            historyLookupLabels={historyLookupLabels}
            layoutConfig={layoutConfig}
            layoutConfigRaw={layoutConfigRaw}
            layoutName={layoutName}
            lookupOptions={lookupOptions}
            userOptions={userOptions} // Pass user options for Owner dropdown
            queueOptions={queueOptions}
            canEdit={canEditRecord}
            canDelete={canDeleteRecord}
            canClaim={canClaim}
            enableChatter={enableChatter}
            comments={comments}
            mentionCandidates={mentionCandidates}
            permissionSetIds={permissionSetIdList}
            ownerGroupId={ownerGroupId}
            blockedFieldApiNames={blockedFieldApiNames}
            submitMode={submitMode}
            systemInfoItems={systemInfoItems}
        />
    );
}
