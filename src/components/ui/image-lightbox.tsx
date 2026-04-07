"use client";

import { useEffect, useState } from "react";

type ImageLightboxProps = {
    src: string;
    alt: string;
    className?: string;
};

export function ImageLightbox({ src, alt, className }: ImageLightboxProps) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <>
            <button
                type="button"
                className="group relative inline-flex cursor-zoom-in items-center justify-center"
                aria-label="Open image preview"
                onClick={() => setOpen(true)}
            >
                <img
                    src={src}
                    alt={alt}
                    className={className ?? "max-h-48 rounded border border-border/60"}
                />
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    View
                </span>
            </button>

            {open ? (
                <div
                    className="fixed inset-0 z-50 bg-slate-100/90 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setOpen(false)}
                >
                    <button
                        type="button"
                        className="absolute right-6 top-6 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-md hover:bg-slate-50"
                        aria-label="Close image preview"
                        onClick={(event) => {
                            event.stopPropagation();
                            setOpen(false);
                        }}
                    >
                        Close
                    </button>
                    <div className="absolute inset-0 overflow-auto p-8" onClick={(event) => event.stopPropagation()}>
                        <div className="flex min-h-full min-w-full items-center justify-center">
                            <div className="w-fit max-w-none">
                                <div className="rounded-2xl bg-white p-4 shadow-2xl">
                                    <img src={src} alt={alt} className="max-h-none max-w-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
