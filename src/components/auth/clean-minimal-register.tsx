"use client";

import { Building2, Lock, Mail, User, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RegisterFormData = {
    name: string;
    username: string;
    email: string;
    password: string;
    organizationName: string;
};

type CleanMinimalRegisterProps = {
    formData: RegisterFormData;
    error?: string | null;
    fieldErrors?: Partial<Record<keyof RegisterFormData, string>>;
    isLoading?: boolean;
    onChange: (field: keyof RegisterFormData, value: string) => void;
    onSubmit: () => void;
    ctaHref?: string;
    ctaLabel?: string;
    className?: string;
};

export function CleanMinimalRegister({
    formData,
    error,
    fieldErrors,
    isLoading = false,
    onChange,
    onSubmit,
    ctaHref = "/login",
    ctaLabel = "Sign in",
    className,
}: CleanMinimalRegisterProps) {
    return (
        <div className={cn("w-full", className)}>
            <div className="relative mx-auto w-full max-w-md rounded-3xl border border-slate-200/90 bg-white/95 p-8 text-black shadow-[0_22px_55px_-30px_rgba(30,64,175,0.45)] ring-1 ring-white/80 backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent" />

                <div className="mb-6 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 shadow-sm">
                        <UserRoundPlus className="h-7 w-7 text-primary" />
                    </div>
                </div>

                <h1 className="mb-2 text-center text-2xl font-semibold text-slate-900">Create your openCRM account</h1>
                <p className="mb-6 text-center text-sm text-slate-500">
                    Set up your organization and admin account in one step.
                </p>

                <div className="grid gap-3">
                    <Field
                        icon={<User className="h-4 w-4" />}
                        placeholder="Full Name"
                        value={formData.name}
                        error={fieldErrors?.name}
                        isLoading={isLoading}
                        autoComplete="name"
                        onChange={(value) => onChange("name", value)}
                    />
                    <Field
                        icon={<User className="h-4 w-4" />}
                        placeholder="Username"
                        value={formData.username}
                        error={fieldErrors?.username}
                        isLoading={isLoading}
                        autoComplete="username"
                        onChange={(value) => onChange("username", value)}
                    />
                    <p className="-mt-1 text-xs text-slate-500">Lowercase letters and numbers only.</p>
                    <Field
                        icon={<Building2 className="h-4 w-4" />}
                        placeholder="Organization Name"
                        value={formData.organizationName}
                        error={fieldErrors?.organizationName}
                        isLoading={isLoading}
                        autoComplete="organization"
                        onChange={(value) => onChange("organizationName", value)}
                    />
                    <Field
                        icon={<Mail className="h-4 w-4" />}
                        placeholder="Email"
                        type="email"
                        value={formData.email}
                        error={fieldErrors?.email}
                        isLoading={isLoading}
                        autoComplete="email"
                        onChange={(value) => onChange("email", value)}
                    />
                    <Field
                        icon={<Lock className="h-4 w-4" />}
                        placeholder="Password"
                        type="password"
                        value={formData.password}
                        error={fieldErrors?.password}
                        isLoading={isLoading}
                        autoComplete="new-password"
                        onChange={(value) => onChange("password", value)}
                    />

                    {error ? (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    ) : null}
                </div>

                <Button
                    onClick={onSubmit}
                    disabled={isLoading}
                    className="mt-4 h-11 w-full rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                    {isLoading ? "Creating account..." : "Create Account"}
                </Button>

                <p className="mt-5 text-center text-sm text-slate-500">
                    Already have an account?{" "}
                    <a href={ctaHref} className="font-medium text-primary hover:underline">
                        {ctaLabel}
                    </a>
                </p>
            </div>
        </div>
    );
}

function Field({
    icon,
    placeholder,
    value,
    error,
    onChange,
    isLoading,
    type = "text",
    autoComplete,
}: {
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
    isLoading: boolean;
    type?: string;
    autoComplete?: string;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
            <Input
                placeholder={placeholder}
                type={type}
                value={value}
                autoComplete={autoComplete}
                disabled={isLoading}
                className={cn(
                    "h-11 rounded-xl bg-white pl-10 text-sm text-slate-900 focus-visible:ring-primary/35",
                    error ? "border-destructive/45" : "border-slate-300"
                )}
                onChange={(e) => onChange(e.target.value)}
                required
            />
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
