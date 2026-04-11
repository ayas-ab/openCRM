"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CleanMinimalRegister } from "@/components/auth/clean-minimal-register";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { toast } from "sonner";
import { register } from "@/actions/auth";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function RegisterPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "username" | "email" | "password" | "organizationName", string>>>({});
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
    const [formData, setFormData] = useState({
        name: "",
        username: "",
        email: "",
        password: "",
        organizationName: "",
    });
    const turnstileEnabled = turnstileSiteKey.length > 0;

    const parseFieldErrors = (message: string) => {
        const parsed: Partial<Record<"name" | "username" | "email" | "password" | "organizationName", string>> = {};
        const parts = message.split(",").map((part) => part.trim());

        for (const part of parts) {
            const colonIndex = part.indexOf(":");
            if (colonIndex === -1) continue;

            const rawField = part.slice(0, colonIndex).trim().toLowerCase();
            const fieldMessage = part.slice(colonIndex + 1).trim();

            if (rawField === "name") parsed.name = fieldMessage;
            if (rawField === "username") parsed.username = fieldMessage;
            if (rawField === "email") parsed.email = fieldMessage;
            if (rawField === "password") parsed.password = fieldMessage;
            if (rawField === "organizationname") parsed.organizationName = fieldMessage;
        }

        return parsed;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitRegister();
    };

    const submitRegister = async () => {
        if (turnstileEnabled && !turnstileToken) {
            const errorMessage = "Complete the security challenge.";
            setError(errorMessage);
            toast.error(errorMessage);
            return;
        }

        setIsLoading(true);
        setError(null);
        setFieldErrors({});

        try {
            const result = await register({
                ...formData,
                turnstileToken: turnstileToken ?? "",
            });

            if (result.success) {
                toast.success("Account created! Please log in.");
                router.push("/login");
            } else {
                const errorMessage = result.error || "Registration failed";
                const parsedErrors = parseFieldErrors(errorMessage);
                const hasFieldErrors = Object.keys(parsedErrors).length > 0;
                if (hasFieldErrors) {
                    setFieldErrors(parsedErrors);
                    setError(null);
                } else {
                    setError(errorMessage);
                    toast.error(errorMessage);
                }
                if (turnstileEnabled) {
                    setTurnstileResetSignal((value) => value + 1);
                }
            }
        } catch {
            setError("An unexpected error occurred");
            toast.error("An unexpected error occurred");
            if (turnstileEnabled) {
                setTurnstileResetSignal((value) => value + 1);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <CleanMinimalRegister
                formData={formData}
                error={error}
                fieldErrors={fieldErrors}
                isLoading={isLoading}
                securityChallenge={
                    turnstileEnabled ? (
                        <TurnstileWidget
                            siteKey={turnstileSiteKey}
                            resetSignal={turnstileResetSignal}
                            onTokenChange={setTurnstileToken}
                        />
                    ) : null
                }
                onChange={(field, value) => {
                    setFormData((prev) => ({ ...prev, [field]: value }));
                    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
                    setError(null);
                }}
                onSubmit={() => {
                    void submitRegister();
                }}
                ctaHref="/login"
                ctaLabel="Sign in"
            />
        </form>
    );
}
