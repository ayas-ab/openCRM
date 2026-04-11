"use client";

import * as React from "react";
import { LogIn, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CleanMinimalSignInProps = {
    identifier: string;
    password: string;
    error?: string | null;
    isLoading?: boolean;
    submitDisabled?: boolean;
    securityChallenge?: React.ReactNode;
    onIdentifierChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    ctaHref?: string;
    ctaLabel?: string;
    className?: string;
};

export function CleanMinimalSignIn({
    identifier,
    password,
    error,
    isLoading = false,
    submitDisabled = false,
    securityChallenge,
    onIdentifierChange,
    onPasswordChange,
    ctaHref = "/register",
    ctaLabel = "Create an account",
    className,
}: CleanMinimalSignInProps) {
    return (
        <div className={cn("w-full", className)}>
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-slate-200/90 bg-white/95 p-8 text-black shadow-[0_22px_55px_-30px_rgba(30,64,175,0.45)] ring-1 ring-white/80 backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent" />
                <div className="mb-6 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 shadow-sm">
                        <LogIn className="h-7 w-7 text-primary" />
                    </div>
                </div>

                <h1 className="mb-2 text-center text-2xl font-semibold text-slate-900">Sign in to openCRM</h1>
                <p className="mb-6 text-center text-sm text-slate-500">
                    Use your username and password to access your workspace.
                </p>

                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <User className="h-4 w-4" />
                        </span>
                        <Input
                            placeholder="Username"
                            type="text"
                            value={identifier}
                            autoComplete="username"
                            disabled={isLoading}
                            className="h-11 rounded-xl border-slate-300 bg-white pl-10 text-sm text-slate-900 focus-visible:ring-primary/35"
                            onChange={(e) => onIdentifierChange(e.target.value)}
                        />
                    </div>

                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <Lock className="h-4 w-4" />
                        </span>
                        <Input
                            placeholder="Password"
                            type="password"
                            value={password}
                            autoComplete="current-password"
                            disabled={isLoading}
                            className="h-11 rounded-xl border-slate-300 bg-white pl-10 text-sm text-slate-900 focus-visible:ring-primary/35"
                            onChange={(e) => onPasswordChange(e.target.value)}
                        />
                    </div>

                    {error ? (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    ) : null}

                    {securityChallenge}
                </div>

                <Button
                    type="submit"
                    disabled={isLoading || submitDisabled}
                    className="mt-4 h-11 w-full rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                    {isLoading ? "Signing in..." : "Get Started"}
                </Button>

                <p className="mt-5 text-center text-sm text-slate-500">
                    New here?{" "}
                    <a href={ctaHref} className="font-medium text-primary hover:underline">
                        {ctaLabel}
                    </a>
                </p>
            </div>
        </div>
    );
}
