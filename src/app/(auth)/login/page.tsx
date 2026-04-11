"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CleanMinimalSignIn } from "@/components/auth/clean-minimal-sign-in";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { toast } from "sonner";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
    const normalizedUsername = username.trim();
    const turnstileEnabled = turnstileSiteKey.length > 0;
    const canSubmit =
        normalizedUsername.length > 0 &&
        password.length > 0 &&
        (!turnstileEnabled || !!turnstileToken);

    const submitLogin = async () => {
        if (!canSubmit) {
            const errorMessage = turnstileEnabled && !turnstileToken
                ? "Complete the security challenge."
                : "Enter your username and password.";
            setError(errorMessage);
            toast.error(errorMessage);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await signIn("credentials", {
                username: normalizedUsername,
                password,
                turnstileToken,
                redirect: false,
            });

            if (result?.error) {
                const normalizedError = result.error?.toLowerCase() ?? "";
                const normalizedCode = result.code?.toLowerCase() ?? "";
                const isTurnstileError = normalizedCode.includes("turnstile") || normalizedError.includes("turnstile");
                const isBadCredentials = normalizedError.includes("credential") || normalizedError.includes("invalid");
                const errorMessage = isTurnstileError
                    ? "Security challenge failed. Please try again."
                    : isBadCredentials
                        ? "Invalid username or password"
                        : "Authentication failed. Please check your credentials.";
                setError(errorMessage);
                toast.error(errorMessage);
                if (turnstileEnabled) {
                    setTurnstileResetSignal((value) => value + 1);
                }
            } else {
                toast.success("Logged in successfully");
                router.push("/app/dashboard");
                router.refresh();
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void submitLogin();
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="w-full"
        >
            <CleanMinimalSignIn
                identifier={username}
                password={password}
                error={error}
                isLoading={isLoading}
                submitDisabled={!canSubmit}
                securityChallenge={
                    turnstileEnabled ? (
                        <TurnstileWidget
                            siteKey={turnstileSiteKey}
                            resetSignal={turnstileResetSignal}
                            onTokenChange={setTurnstileToken}
                        />
                    ) : null
                }
                onIdentifierChange={(value) => {
                    setUsername(value);
                    setError(null);
                }}
                onPasswordChange={(value) => {
                    setPassword(value);
                    setError(null);
                }}
                ctaHref="/register"
                ctaLabel="Create an account"
            />
        </form>
    );
}
