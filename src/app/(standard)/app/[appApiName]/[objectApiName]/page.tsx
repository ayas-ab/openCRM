import { getRecords } from "@/actions/standard/record-actions";
import { DataTable } from "@/components/standard/views/data-table";
import { auth } from "@/auth";
import { checkPermission, hasSystemPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
    getAccessibleListViews,
    getPinnedListViewIds,
    getUserListViewPreference,
} from "@/lib/list-views";

export default async function ObjectListPage({
    params,
    searchParams,
}: {
    params: Promise<{ appApiName: string; objectApiName: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { appApiName, objectApiName } = await params;
    const resolvedSearch = (await searchParams) || {};

    const parseParam = (value?: string | string[]) => {
        if (!value) return undefined;
        return Array.isArray(value) ? value[0] : value;
    };

    const pageParam = parseParam(resolvedSearch.page);
    const pageSizeParam = parseParam(resolvedSearch.pageSize);
    const sortField = parseParam(resolvedSearch.sortField);
    const sortDirectionParam = parseParam(resolvedSearch.sortDirection);
    const viewParam = parseParam(resolvedSearch.view);

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 25;
    const sortDirection = sortDirectionParam === "asc" ? "asc" : "desc";

    try {
        const session = await auth();
        const userId = parseInt(session?.user?.id as string);
        const organizationId = parseInt((session?.user as any)?.organizationId);
        const canCreate = await checkPermission(userId, organizationId, objectApiName, "create");
        const canEdit = await checkPermission(userId, organizationId, objectApiName, "edit");
        const canModifyListViews = await checkPermission(userId, organizationId, objectApiName, "modifyListViews");
        const canDataLoad = await hasSystemPermission(userId, organizationId, "dataLoading");
        const isAdmin = (session?.user as any)?.userType === "admin";

        const objectDef = await db.objectDefinition.findUnique({
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

        if (!objectDef) {
            return (
                <div className="p-6 text-center">
                    <h2 className="text-xl font-semibold text-destructive">Object not found</h2>
                </div>
            );
        }

        const listViews = await getAccessibleListViews(userId, organizationId, objectDef.id);
        const preference = await getUserListViewPreference(userId, organizationId, objectDef.id);
        const pinnedListViewIds = await getPinnedListViewIds(userId, objectDef.id, organizationId);

        const requestedViewId = viewParam ? parseInt(viewParam, 10) : null;
        const availableViewIds = new Set(listViews.map((view) => view.id));
        const defaultViewId =
            listViews.find((view) => view.isDefault)?.id ?? listViews[0]?.id ?? null;
        const activeListViewId =
            (requestedViewId && availableViewIds.has(requestedViewId)
                ? requestedViewId
                : preference?.defaultListViewId && availableViewIds.has(preference.defaultListViewId)
                    ? preference.defaultListViewId
                    : defaultViewId) ?? undefined;

        const groups = canModifyListViews
            ? await db.group.findMany({
                where: { organizationId },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            })
            : [];
        const permissionSets = canModifyListViews
            ? await db.permissionSet.findMany({
                where: { organizationId },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            })
            : [];
        const queues = canModifyListViews
            ? await db.queue.findMany({
                where: { organizationId },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            })
            : [];

        const result = await getRecords(objectApiName, page, pageSize, sortField, sortDirection, activeListViewId);
        const { data, meta } = result;

        return (
            <DataTable
                data={data}
                objectDef={meta.objectDef}
                appApiName={appApiName}
                canCreate={canCreate}
                canEdit={canEdit}
                canDataLoad={canDataLoad}
                lookupResolutions={meta.lookupResolutions}
                listViews={listViews}
                activeListViewId={activeListViewId ?? null}
                activeListView={meta.listView}
                pinnedListViewIds={pinnedListViewIds}
                canModifyListViews={canModifyListViews}
                userDefaultListViewId={preference?.defaultListViewId ?? null}
                groups={groups}
                permissionSets={permissionSets}
                queues={queues}
                isAdmin={isAdmin}
                pagination={{
                    page: meta.page,
                    pageSize: meta.pageSize,
                    total: meta.total,
                    totalPages: meta.totalPages,
                    sortField: meta.sortField,
                    sortDirection: meta.sortDirection,
                }}
            />
        );
    } catch (error: any) {
        return (
            <div className="p-6 text-center">
                <h2 className="text-xl font-semibold text-destructive">Error Loading Data</h2>
                <p className="text-muted-foreground">{error.message}</p>
            </div>
        );
    }
}
