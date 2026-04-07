import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isLoggedIn = !!req.auth;
    const userType = (req.auth?.user as any)?.userType;

    // Public marketing/auth routes
    const isAuthLandingRoute = pathname === "/" || pathname === "/login" || pathname === "/register";
    const isPublicRoute = isAuthLandingRoute;

    // Admin routes
    const isAdminRoute = pathname.startsWith("/admin");

    // API routes
    const isApiRoute = pathname.startsWith("/api");
    const isAuthApiRoute = pathname.startsWith("/api/auth");

    // If not logged in and trying to access protected route
    if (!isLoggedIn && isApiRoute && !isAuthApiRoute) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If not logged in and trying to access protected route
    if (!isLoggedIn && !isPublicRoute && !isApiRoute) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // If logged in and trying to access auth landing routes, redirect to dashboard
    if (isLoggedIn && isAuthLandingRoute) {
        return NextResponse.redirect(new URL("/app/dashboard", req.url));
    }

    // If trying to access admin route but not an admin
    if (isAdminRoute && userType !== "admin") {
        return NextResponse.redirect(new URL("/app/dashboard", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|imgs/).*)"],
};
