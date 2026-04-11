"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
    interface Window {
        turnstile?: {
            render: (
                container: string | HTMLElement,
                options: {
                    sitekey: string;
                    callback?: (token: string) => void;
                    "expired-callback"?: () => void;
                    "error-callback"?: () => void;
                    theme?: "light" | "dark" | "auto";
                }
            ) => string;
            reset: (widgetId?: string) => void;
            remove: (widgetId?: string) => void;
        };
    }
}

type TurnstileWidgetProps = {
    siteKey: string;
    resetSignal?: number;
    onTokenChange: (token: string | null) => void;
    theme?: "light" | "dark" | "auto";
};

export function TurnstileWidget({
    siteKey,
    resetSignal = 0,
    onTokenChange,
    theme = "light",
}: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [scriptReady, setScriptReady] = useState(false);
    const [renderError, setRenderError] = useState(false);

    useEffect(() => {
        if (window.turnstile) {
            setScriptReady(true);
            return;
        }

        const startedAt = Date.now();
        const intervalId = window.setInterval(() => {
            if (window.turnstile) {
                setScriptReady(true);
                window.clearInterval(intervalId);
                return;
            }

            if (Date.now() - startedAt > 5000) {
                setRenderError(true);
                window.clearInterval(intervalId);
            }
        }, 250);

        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (!scriptReady || !window.turnstile || widgetIdRef.current || !containerRef.current) {
            return;
        }

        try {
            setRenderError(false);
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                theme,
                callback: (token) => onTokenChange(token),
                "expired-callback": () => onTokenChange(null),
                "error-callback": () => {
                    onTokenChange(null);
                    setRenderError(true);
                },
            });
        } catch {
            setRenderError(true);
            return;
        }

        return () => {
            if (widgetIdRef.current && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [onTokenChange, scriptReady, siteKey, theme]);

    useEffect(() => {
        if (!widgetIdRef.current || !window.turnstile) {
            return;
        }

        onTokenChange(null);
        window.turnstile.reset(widgetIdRef.current);
    }, [onTokenChange, resetSignal]);

    return (
        <div className="space-y-2">
            <Script
                id="cloudflare-turnstile"
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                strategy="afterInteractive"
                onLoad={() => setScriptReady(true)}
                onReady={() => setScriptReady(true)}
            />
            <div ref={containerRef} className="min-h-[65px]" />
            {renderError ? (
                <p className="text-xs text-destructive">
                    Security challenge failed to load. Refresh the page and try again.
                </p>
            ) : null}
            <p className="text-xs text-slate-500">
                Complete the security challenge before submitting.
            </p>
        </div>
    );
}
