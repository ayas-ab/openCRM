import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getClientIpFromHeaders, verifyTurnstileToken } from "@/lib/security/turnstile";

class TurnstileSigninError extends CredentialsSignin {
    code = "turnstile";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
                turnstileToken: { label: "Turnstile Token", type: "text" },
            },
            async authorize(credentials, request) {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                const normalizedUsername = (credentials.username as string)
                    .trim()
                    .toLowerCase();
                const turnstileResult = await verifyTurnstileToken(
                    credentials.turnstileToken as string | undefined,
                    getClientIpFromHeaders(request.headers)
                );

                if (!turnstileResult.success) {
                    throw new TurnstileSigninError();
                }

                const user = await db.user.findUnique({
                    where: { username: normalizedUsername },
                });

                if (!user || !user.password) {
                    return null;
                }

                const isPasswordValid = await bcrypt.compare(
                    credentials.password as string,
                    user.password
                );

                if (!isPasswordValid) {
                    return null;
                }

                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name,
                    username: user.username,
                    organizationId: user.organizationId,
                    userType: user.userType,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.organizationId = (user as any).organizationId;
                token.userType = (user as any).userType;
                token.username = (user as any).username;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).organizationId = token.organizationId;
                (session.user as any).userType = token.userType;
                (session.user as any).username = token.username;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
});
