"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
    id: number;
    name: string;
    updatedAt: string;
    objectApiName: string;
    objectLabel: string;
};

interface GlobalSearchProps {
    defaultAppApiName?: string | null;
}

export function GlobalSearch({ defaultAppApiName }: GlobalSearchProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                inputRef.current?.focus();
                setIsActive(true);
            }
        };

        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        const trimmed = query.trim();

        if (trimmed.length < 2) {
            setResults([]);
            setError(null);
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                setIsLoading(true);
                setError(null);
                const params = new URLSearchParams({ q: trimmed });
                const response = await fetch(`/api/search/global?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error("Search failed");
                const data = await response.json();
                setResults(data.results || []);
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
    }, [query]);

    const handleNavigate = (result: SearchResult) => {
        if (!defaultAppApiName) return;
        router.push(`/app/${defaultAppApiName}/${result.objectApiName}/${result.id}`);
        setIsActive(false);
        setResults([]);
        setQuery("");
    };

    const showDropdown = isActive && (query.trim().length > 0 || results.length > 0);

    return (
        <div className="relative w-full max-w-xl">
            <div
                className={cn(
                    "flex items-center gap-2 rounded-lg border bg-muted px-4 py-2 text-sm text-muted-foreground transition focus-within:ring-2 focus-within:ring-primary",
                    !defaultAppApiName && "opacity-60"
                )}
            >
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={defaultAppApiName ? "Search records..." : "Select an app to search"}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    onFocus={() => setIsActive(true)}
                    onBlur={() => setTimeout(() => setIsActive(false), 150)}
                    disabled={!defaultAppApiName}
                />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <span className="hidden sm:inline-flex items-center rounded border px-1 text-[10px] font-medium uppercase text-muted-foreground">
                    Ctrl K
                </span>
            </div>

            {defaultAppApiName && showDropdown && (
                <div className="absolute left-0 right-0 z-50 mt-2 rounded-lg border bg-popover p-2 shadow-lg">
                    {query.trim().length < 2 && (
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                            Type at least 2 characters to search.
                        </p>
                    )}

                    {query.trim().length >= 2 && (
                        <>
                            {isLoading && (
                                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Searching...
                                </div>
                            )}

                            {!isLoading && error && (
                                <p className="px-2 py-3 text-sm text-destructive">{error}</p>
                            )}

                            {!isLoading && !error && results.length === 0 && (
                                <p className="px-2 py-3 text-sm text-muted-foreground">No records found.</p>
                            )}

                            {!isLoading && !error && (
                                <ul className="max-h-72 overflow-y-auto">
                                    {results.map((result) => (
                                        <li key={`${result.objectApiName}-${result.id}`}>
                                            <button
                                                type="button"
                                                className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left hover:bg-muted"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => handleNavigate(result)}
                                            >
                                                <span className="font-medium text-sm text-foreground">
                                                    {result.name}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {result.objectLabel} - Updated{" "}
                                                    {new Date(result.updatedAt).toLocaleString()}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                    <li className="mt-1 border-t border-border/60 pt-1">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => {
                                                if (!defaultAppApiName) return;
                                                const params = new URLSearchParams({ q: query.trim() });
                                                router.push(`/app/${defaultAppApiName}/search?${params.toString()}`);
                                                setIsActive(false);
                                            }}
                                        >
                                            See All results for "{query.trim()}"
                                        </button>
                                    </li>
                                </ul>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
