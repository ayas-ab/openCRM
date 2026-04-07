"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type MermaidDiagramProps = {
    chart: string;
    className?: string;
    enableDownloads?: boolean;
    fileNameBase?: string;
};

function sanitizeFileName(fileName: string) {
    return fileName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function svgToPngBlob(svgMarkup: string) {
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Unable to load SVG for PNG export."));
            img.src = objectUrl;
        });

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
        const svg = doc.documentElement;
        const viewBox = svg.getAttribute("viewBox");
        const widthAttr = Number(svg.getAttribute("width"));
        const heightAttr = Number(svg.getAttribute("height"));

        let width = Number.isFinite(widthAttr) ? widthAttr : image.naturalWidth;
        let height = Number.isFinite(heightAttr) ? heightAttr : image.naturalHeight;

        if ((!width || !height) && viewBox) {
            const parts = viewBox.split(/\s+/).map(Number);
            if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
                width = parts[2];
                height = parts[3];
            }
        }

        width = Math.max(1, Math.ceil(width || 1400));
        height = Math.max(1, Math.ceil(height || 900));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Canvas context is not available.");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Unable to generate PNG export."));
                    return;
                }
                resolve(blob);
            }, "image/png");
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export function MermaidDiagram({
    chart,
    className,
    enableDownloads = false,
    fileNameBase = "diagram",
}: MermaidDiagramProps) {
    const rawId = useId();
    const baseId = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ""), [rawId]);
    const [svg, setSvg] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [isExportingPng, setIsExportingPng] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const normalizedFileName = useMemo(() => {
        const sanitized = sanitizeFileName(fileNameBase);
        return sanitized || "diagram";
    }, [fileNameBase]);

    useEffect(() => {
        let cancelled = false;

        async function renderDiagram() {
            try {
                setError(null);
                const mermaidModule = await import("mermaid");
                const mermaid = mermaidModule.default;

                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "strict",
                    theme: "base",
                    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif",
                    themeVariables: {
                        primaryColor: "#f8fafc",
                        primaryTextColor: "#0f172a",
                        primaryBorderColor: "#475569",
                        lineColor: "#334155",
                        secondaryColor: "#eef2ff",
                        tertiaryColor: "#ecfeff",
                        clusterBkg: "#f8fafc",
                        clusterBorder: "#94a3b8",
                        edgeLabelBackground: "#ffffff",
                        background: "#ffffff",
                        fontFamily: "IBM Plex Sans, Segoe UI, sans-serif",
                    },
                    themeCSS: `
                        .node rect,
                        .node circle,
                        .node polygon,
                        .node path {
                            stroke-width: 1.5px;
                        }
                        .nodeLabel p,
                        .edgeLabel p,
                        .label text {
                            font-weight: 500;
                            letter-spacing: 0.01em;
                        }
                        .cluster rect {
                            rx: 10;
                            ry: 10;
                            stroke-width: 1.2px;
                        }
                        .edgePath path {
                            stroke-width: 1.6px;
                        }
                        .actor {
                            stroke-width: 1.5px;
                        }
                        .er.entityBox {
                            stroke-width: 1.5px;
                        }
                        .messageLine0,
                        .messageLine1 {
                            stroke-width: 1.5px;
                        }
                        .loopText,
                        .labelBox {
                            rx: 8;
                            ry: 8;
                        }
                        .section {
                            stroke-width: 1.3px;
                        }
                    `,
                    sequence: {
                        diagramMarginX: 30,
                        diagramMarginY: 20,
                        actorMargin: 70,
                        boxMargin: 12,
                        messageMargin: 30,
                        mirrorActors: false,
                    },
                    flowchart: {
                        curve: "basis",
                        htmlLabels: true,
                    },
                });

                const diagramId = `mermaid-${baseId}-${Math.random().toString(36).slice(2, 10)}`;
                const { svg: renderedSvg, bindFunctions } = await mermaid.render(diagramId, chart);

                if (cancelled) return;

                setSvg(renderedSvg);

                if (bindFunctions && containerRef.current) {
                    bindFunctions(containerRef.current);
                }
            } catch (renderError) {
                if (cancelled) return;
                const message =
                    renderError instanceof Error ? renderError.message : "Unable to render this diagram.";
                setError(message);
            }
        }

        renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [chart, baseId]);

    const handleSvgDownload = () => {
        if (!svg) return;
        setExportError(null);
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        triggerDownload(blob, `${normalizedFileName}.svg`);
    };

    const handlePngDownload = async () => {
        if (!svg) return;
        setExportError(null);
        setIsExportingPng(true);
        try {
            const blob = await svgToPngBlob(svg);
            triggerDownload(blob, `${normalizedFileName}.png`);
        } catch (downloadError) {
            const message =
                downloadError instanceof Error
                    ? downloadError.message
                    : "Unable to export PNG for this diagram.";
            setExportError(message);
        } finally {
            setIsExportingPng(false);
        }
    };

    if (error) {
        return (
            <div className={className}>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    Diagram render failed: {error}
                </div>
                <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                    {chart}
                </pre>
            </div>
        );
    }

    return (
        <div className={className}>
            {enableDownloads ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleSvgDownload}
                        disabled={!svg}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Download SVG
                    </button>
                    <button
                        type="button"
                        onClick={handlePngDownload}
                        disabled={!svg || isExportingPng}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isExportingPng ? "Generating PNG..." : "Download PNG"}
                    </button>
                    {exportError ? (
                        <span className="text-xs text-rose-700">{exportError}</span>
                    ) : null}
                </div>
            ) : null}
            {!svg ? (
                <div className="h-[260px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ) : (
                <div
                    ref={containerRef}
                    className="overflow-x-auto rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-inner [&_svg]:h-auto [&_svg]:min-w-[680px] [&_svg]:max-w-none"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            )}
        </div>
    );
}
