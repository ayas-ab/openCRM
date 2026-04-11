"use server";

import { db } from "@/lib/db";
import { UserType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createOrgTemplate } from "@/lib/seeding/create-org-template";
import { ensureUserCompanionRecord } from "@/lib/user-companion";
import { headers } from "next/headers";
import { getClientIpFromHeaders, verifyTurnstileToken } from "@/lib/security/turnstile";

const registerSchema = z.object({
    organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
    name: z.string().min(2, "Name must be at least 2 characters"),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-z0-9]+$/, "Username must be lowercase letters and numbers only")
        .transform((value) => value.toLowerCase()),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    turnstileToken: z.string().trim().min(1, "Complete the security challenge."),
});

const isProduction = process.env.NODE_ENV === "production";
const debugLog = (...args: unknown[]) => {
    if (!isProduction) {
        console.log(...args);
    }
};

export async function register(data: z.infer<typeof registerSchema>) {
    try {
        debugLog("Registration attempt");

        // Validate input
        const validated = registerSchema.parse(data);
        debugLog("Validation passed");

        const requestHeaders = await headers();
        const turnstileResult = await verifyTurnstileToken(
            validated.turnstileToken,
            getClientIpFromHeaders(requestHeaders)
        );

        if (!turnstileResult.success) {
            return {
                success: false,
                error: turnstileResult.reason === "unavailable"
                    ? "Security challenge is unavailable. Please contact support."
                    : "Security challenge failed. Please try again.",
            };
        }

        // Check if username already exists
        const existingUsername = await db.user.findUnique({
            where: { username: validated.username },
            select: { id: true },
        });

        if (existingUsername) {
            debugLog("Username already exists");
            return {
                success: false,
                error: "This username is already taken.",
            };
        }

        // Block registration if the email belongs to an existing org owner
        const ownerEmailConflict = await db.organization.findFirst({
            where: { owner: { email: validated.email } },
            select: { id: true },
        });

        if (ownerEmailConflict) {
            debugLog("Email belongs to an existing org owner");
            return {
                success: false,
                error: "This email is already used by an organization owner.",
            };
        }

        // Hash password
        debugLog("Hashing password");
        const hashedPassword = await bcrypt.hash(validated.password, 10);

        // Create organization slug from name
        const slug = validated.organizationName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        debugLog("Creating organization and user");
        // Transaction: Create Organization, User, and link owner
        const result = await db.$transaction(async (tx) => {
            // 1. Create Organization
            const organization = await tx.organization.create({
                data: {
                    name: validated.organizationName,
                    slug,
                },
            });

            // 2. Create Admin User
            const user = await tx.user.create({
                data: {
                    name: validated.name,
                    username: validated.username,
                    email: validated.email,
                    password: hashedPassword,
                    userType: UserType.admin,
                    organizationId: organization.id,
                },
            });

            // 3. Link org owner
            await tx.organization.update({
                where: { id: organization.id },
                data: { ownerId: user.id },
            });

            return { organization, user };
        });

        debugLog("Seeding standard objects");
        // 3. Seed standard objects (outside transaction to avoid timeout)
        await createOrgTemplate(result.organization.id);
        await db.$transaction(async (tx) => {
            await ensureUserCompanionRecord(tx, result.organization.id, result.user.id);
        });

        debugLog("Registration successful");
        return {
            success: true,
            data: {
                organizationId: result.organization.id,
                userId: result.user.id,
            },
        };
    } catch (error: any) {
        console.error("Registration error:", {
            name: error?.name,
            code: error?.code,
        });

        // Handle Zod Errors (Validation)
        if (error instanceof z.ZodError || error?.name === "ZodError") {
            // If it's a ZodError, it might have an 'errors' array or we might need to parse the message if it was serialized
            let errorMessages = "";

            if (error.errors && Array.isArray(error.errors)) {
                errorMessages = error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ');
            } else {
                // Fallback: try to parse the message if it looks like JSON
                try {
                    const parsed = JSON.parse(error.message);
                    if (Array.isArray(parsed)) {
                        errorMessages = parsed.map((err: any) => `${err.path?.join('.') || ''}: ${err.message}`).join(', ');
                    } else {
                        errorMessages = error.message;
                    }
                } catch {
                    errorMessages = error.message;
                }
            }

            debugLog("Zod validation error:", errorMessages);
            return {
                success: false,
                error: errorMessages,
            };
        }

        // Handle Prisma Unique Constraint Errors
        if (error?.code === "P2002") {
            const target = error.meta?.target;
            debugLog("Prisma unique constraint error");

            if (typeof target === 'string' && target.includes('slug')) {
                return {
                    success: false,
                    error: "An organization with this name already exists. Please choose a different name.",
                };
            }

            if (Array.isArray(target) && target.includes('slug')) {
                return {
                    success: false,
                    error: "An organization with this name already exists. Please choose a different name.",
                };
            }

            if (typeof target === 'string' && target.includes('username')) {
                return {
                    success: false,
                    error: "This username is already taken.",
                };
            }
            if (Array.isArray(target) && target.includes('username')) {
                return {
                    success: false,
                    error: "This username is already taken.",
                };
            }

            return {
                success: false,
                error: "A record with this information already exists.",
            };
        }

        // Return the actual error message for debugging
        return {
            success: false,
            error: error?.message || "An error occurred during registration. Please try again.",
        };
    }
}
