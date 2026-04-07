"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Link from "next/link";

type SearchResult = {
    id: number;
    name: string;
    updatedAt: string;
    objectApiName: string;
    objectLabel: string;
};

type SearchObject = {
    id: number;
    apiName: string;
    label: string;
};

type SearchResponse = {
    results: SearchResult[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
};

interface GlobalSearchPageProps {
    appApiName: string;
    objects: SearchObject[];
    initialQuery?: string;
    initialObject?: string;
}

export function GlobalSearchPage({
    appApiName,
    objects,
    initialQuery = "",
    initialObject = "",
}: GlobalSearchPageProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(initialQuery);
    const [objectFilter, setObjectFilter] = useState(initialObject || "all");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });

    const qParam = searchParams.get("q") || "";
    const objectParam = searchParams.get("object") || "all";
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const pageSizeParam = parseInt(searchParams.get("pageSize") || "25", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : 25;

    useEffect(() => {
        setQuery(qParam);
    }, [qParam]);

    useEffect(() => {
        setObjectFilter(objectParam);
    }, [objectParam]);

    const updateQuery = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });
        router.push(`${pathname}?${params.toString()}`);
    };

    useEffect(() => {
        const trimmed = qParam.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setError(null);
            setIsLoading(false);
            setPageInfo({ page, pageSize, total: 0, totalPages: 1 });
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                setIsLoading(true);
                setError(null);
                const params = new URLSearchParams({
                    q: trimmed,
                    mode: "full",
                    page: String(page),
                    pageSize: String(pageSize),
                });
                if (objectParam && objectParam !== "all") {
                    params.set("object", objectParam);
                }
                const response = await fetch(`/api/search/global?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error("Search failed");
                const data = (await response.json()) as SearchResponse;
                setResults(data.results || []);
                setPageInfo({
                    page: data.page || page,
                    pageSize: data.pageSize || pageSize,
                    total: data.total || 0,
                    totalPages: data.totalPages || 1,
                });
            } catch (fetchError) {
                if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
                    console.error(fetchError);
                    setError("Unable to fetch results. Try again.");
                }
            } finally {
                setIsLoading(false);
            }
        }, 200);

        return () => {
            controller.abort();
            clearTimeout(timeout);
        };
    }, [qParam, objectParam, page, pageSize]);

    const handleQueryChange = (value: string) => {
        setQuery(value);
        updateQuery({
            q: value.trim() ? value : null,
            page: "1",
        });
    };

    const handleObjectChange = (value: string) => {
        setObjectFilter(value);
        updateQuery({
            object: value === "all" ? null : value,
            page: "1",
        });
    };

    const handlePageChange = (nextPage: number) => {
        const clamped = Math.max(1, Math.min(nextPage, pageInfo.totalPages));
        updateQuery({ page: String(clamped) });
    };

    const showingFrom = pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1;
    const showingTo = Math.min(pageInfo.total, showingFrom + results.length - 1);

    const objectOptions = useMemo(() => [{ apiName: "all", label: "All objects" }, ...objects], [objects]);

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-white shadow-sm">
                <div className="px-6 py-4 border-b border-border/50">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Search</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Search across all readable objects.
                    </p>
                </div>
                <div className="px-6 py-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex w-full items-center gap-2 rounded-lg border bg-muted px-4 py-2 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-primary">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={query}
                                onChange={(event) => handleQueryChange(event.target.value)}
                                placeholder="Search records..."
                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        <div className="w-full lg:w-64">
                            <Select value={objectFilter} onValueChange={handleObjectChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All objects" />
                                </SelectTrigger>
                                <SelectContent>
                                    {objectOptions.map((obj) => (
                                        <SelectItem key={obj.apiName || "all"} value={obj.apiName}>
                                            {obj.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {qParam.trim().length < 2 && (
                        <p className="text-sm text-muted-foreground">Type at least 2 characters to search.</p>
                    )}
                </div>
            </div>

            {qParam.trim().length >= 2 && (
                <div className="space-y-4">
                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {!error && results.length === 0 && !isLoading && (
                        <div className="rounded-lg border border-border/60 bg-white px-6 py-8 text-center text-sm text-muted-foreground">
                            No records found.
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden">
                            <ul className="divide-y divide-border/60">
                                {results.map((result) => (
                                    <li key={`${result.objectApiName}-${result.id}`} className="px-6 py-4">
                                        <Link
                                            href={`/app/${appApiName}/${result.objectApiName}/${result.id}`}
                                            className="block"
                                        >
                                            <div className="text-sm font-semibold text-foreground">
                                                {result.name}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {result.objectLabel} - Updated{" "}
                                                {new Date(result.updatedAt).toLocaleString()}
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-2">
                        <div className="text-xs font-medium text-muted-foreground">
                            Showing {showingFrom}-{showingTo} of {pageInfo.total} records
                        </div>
                        {pageInfo.totalPages > 1 && (
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href="#"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                handlePageChange(pageInfo.page - 1);
                                            }}
                                            className={cn("h-8 w-8 p-0", pageInfo.page === 1 ? "pointer-events-none opacity-50" : "")}
                                        />
                                    </PaginationItem>
                                    <PaginationItem>
                                        <div className="text-sm font-medium mx-2 min-w-[3rem] text-center">
                                            {pageInfo.page} / {pageInfo.totalPages}
                                        </div>
                                    </PaginationItem>
                                    <PaginationItem>
                                        <PaginationNext
                                            href="#"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                handlePageChange(pageInfo.page + 1);
                                            }}
                                            className={cn("h-8 w-8 p-0", pageInfo.page === pageInfo.totalPages ? "pointer-events-none opacity-50" : "")}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
