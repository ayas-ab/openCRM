"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CleanMinimalRegister } from "@/components/auth/clean-minimal-register";
import { toast } from "sonner";
import { register } from "@/actions/auth";

export default function RegisterPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "username" | "email" | "password" | "organizationName", string>>>({});
    const [formData, setFormData] = useState({
        name: "",
        username: "",
        email: "",
        password: "",
        organizationName: "",
    });

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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(null); // Clear error on input change
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitRegister();
    };

    const submitRegister = async () => {
        setIsLoading(true);
        setError(null);
        setFieldErrors({});

        try {
            const result = await register(formData);

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
            }
        } catch {
            setError("An unexpected error occurred");
            toast.error("An unexpected error occurred");
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
