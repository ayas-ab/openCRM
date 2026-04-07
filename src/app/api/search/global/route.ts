"use server";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getSearchableObjects } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { buildRecordAccessFilter, getUserQueueIds } from "@/lib/record-access";

const MAX_RESULTS = 30;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

async function findPrimaryNameFieldId(objectDefId: number) {
    const nameField = await db.fieldDefinition.findFirst({
        where: {
            objectDefId,
            apiName: "name",
        },
        select: { id: true },
        orderBy: { id: "asc" },
    });

    if (nameField) return nameField.id;

    const fallback = await db.fieldDefinition.findFirst({
        where: {
            objectDefId,
            type: "Text",
        },
        select: { id: true },
        orderBy: { id: "asc" },
    });

    return fallback?.id ?? null;
}

function buildSearchFilters(
    mode: "exact" | "starts" | "contains",
    query: string,
    normalizedQuery: string,
    primaryFieldId: number | null
): Prisma.RecordWhereInput[] {
    const filters: Prisma.RecordWhereInput[] = [];
    if (mode === "exact") {
        filters.push({ name: { equals: query, mode: "insensitive" } });
    } else if (mode === "starts") {
        filters.push({ name: { startsWith: query, mode: "insensitive" } });
    } else {
        filters.push({ name: { contains: query, mode: "insensitive" } });
    }

    if (primaryFieldId) {
        const fieldPredicate =
            mode === "exact"
                ? { equals: normalizedQuery }
                : mode === "starts"
                    ? { startsWith: normalizedQuery }
                    : { contains: normalizedQuery };
        filters.push({
            fields: {
                some: {
                    fieldDefId: primaryFieldId,
                    valueSearch: fieldPredicate,
                },
            },
        });
    }

    return filters;
}

type SearchRecord = {
    id: number;
    name: string;
    updatedAt: Date;
    objectId: number;
    objectApiName: string;
    objectLabel: string;
    rank: number;
};

function toSearchResult(record: any, object: { id: number; apiName: string; label: string }, rank: number): SearchRecord {
    return {
        id: record.id,
        name: record.name || record.fields?.[0]?.valueText || `Record #${record.id}`,
        updatedAt: record.updatedAt,
        objectId: object.id,
        objectApiName: object.apiName,
        objectLabel: object.label,
        rank,
    };
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user as any;
        const userId = parseInt(user.id);
        const organizationId = parseInt(user.organizationId);
        const queueIds = await getUserQueueIds(userId);
        const userGroupId = (await db.user.findUnique({
            where: { id: userId },
            select: { groupId: true },
        }))?.groupId ?? null;

        if (isNaN(userId) || isNaN(organizationId)) {
            return NextResponse.json({ error: "Invalid session" }, { status: 400 });
        }

        const url = new URL(request.url);
        const query = (url.searchParams.get("q") || "").trim();
        const mode = (url.searchParams.get("mode") || "").toLowerCase();
        const rawObjectFilter = (url.searchParams.get("object") || "").trim();
        const objectFilter = rawObjectFilter === "all" ? "" : rawObjectFilter;
        const pageParam = parseInt(url.searchParams.get("page") || "1", 10);
        const pageSizeParam = parseInt(url.searchParams.get("pageSize") || "", 10);
        const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
        const pageSize =
            Number.isFinite(pageSizeParam) && pageSizeParam > 0
                ? Math.min(pageSizeParam, MAX_PAGE_SIZE)
                : DEFAULT_PAGE_SIZE;

        if (query.length < MIN_QUERY_LENGTH) {
            return NextResponse.json({ results: [] });
        }

        const normalizedQuery = query.toLowerCase();

        const objects = await getSearchableObjects(userId, organizationId);

        if (objects.length === 0) {
            return NextResponse.json({ results: [] });
        }

        const filteredObjects = objectFilter
            ? objects.filter((obj) => obj.apiName === objectFilter)
            : objects;
        if (filteredObjects.length === 0) {
            return NextResponse.json({ results: [] });
        }

        const perObjectLimit = Math.max(5, Math.ceil(MAX_RESULTS / filteredObjects.length));

        const resultPromises = filteredObjects.map(async object => {
            const primaryFieldId = await findPrimaryNameFieldId(object.id);

            const select: Prisma.RecordSelect = {
                id: true,
                name: true,
                updatedAt: true,
            };

            if (primaryFieldId) {
                select.fields = {
                    where: { fieldDefId: primaryFieldId },
                    select: { valueText: true },
                };
            }

            const accessFilter = object.access.canReadAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);

            const buildWhere = (filters: Prisma.RecordWhereInput[]) => ({
                organizationId,
                objectDefId: object.id,
                ...(accessFilter ?? {}),
                OR: filters,
            });

            const limit = mode === "full" ? undefined : perObjectLimit;

            const exactRecords = await db.record.findMany({
                where: buildWhere(buildSearchFilters("exact", query, normalizedQuery, primaryFieldId)),
                select,
                orderBy: { updatedAt: "desc" },
                ...(limit ? { take: limit } : {}),
            });

            const startsRecords = await db.record.findMany({
                where: buildWhere(buildSearchFilters("starts", query, normalizedQuery, primaryFieldId)),
                select,
                orderBy: { updatedAt: "desc" },
                ...(limit ? { take: limit } : {}),
            });

            const containsRecords = await db.record.findMany({
                where: buildWhere(buildSearchFilters("contains", query, normalizedQuery, primaryFieldId)),
                select,
                orderBy: { updatedAt: "desc" },
                ...(limit ? { take: limit } : {}),
            });

            const deduped = new Map<number, SearchRecord>();
            exactRecords.forEach((record) => {
                deduped.set(record.id, toSearchResult(record, object, 0));
            });
            startsRecords.forEach((record) => {
                if (!deduped.has(record.id)) {
                    deduped.set(record.id, toSearchResult(record, object, 1));
                }
            });
            containsRecords.forEach((record) => {
                if (!deduped.has(record.id)) {
                    deduped.set(record.id, toSearchResult(record, object, 2));
                }
            });

            const results = Array.from(deduped.values()).sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });

            return limit ? results.slice(0, limit) : results;
        });

        const groupedResults = await Promise.all(resultPromises);

        const flattened = groupedResults
            .flat()
            .sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });

        if (mode === "full") {
            const totalPromises = filteredObjects.map(async (object) => {
                const primaryFieldId = await findPrimaryNameFieldId(object.id);
                const accessFilter = object.access.canReadAll ? null : buildRecordAccessFilter(userId, queueIds, userGroupId);
                const where = {
                    organizationId,
                    objectDefId: object.id,
                    ...(accessFilter ?? {}),
                    OR: buildSearchFilters("contains", query, normalizedQuery, primaryFieldId),
                };
                return db.record.count({ where });
            });
            const totals = await Promise.all(totalPromises);
            const total = totals.reduce((sum, value) => sum + value, 0);
            const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
            const startIndex = (page - 1) * pageSize;
            const paged = flattened.slice(startIndex, startIndex + pageSize);
            return NextResponse.json({
                results: paged.map((result) => ({
                    ...result,
                    updatedAt: result.updatedAt.toISOString(),
                })),
                page,
                pageSize,
                total,
                totalPages,
            });
        }

        return NextResponse.json({
            results: flattened
                .slice(0, MAX_RESULTS)
                .map((result) => ({ ...result, updatedAt: result.updatedAt.toISOString() })),
        });
    } catch (error) {
        console.error("Global search error", error);
        return NextResponse.json({ error: "Failed to search" }, { status: 500 });
    }
}
