import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
    interface Session {
        user?: {
            id?: string;
            email?: string | null;
            name?: string | null;
            username?: string | null;
            organizationId?: string | number;
            userType?: string | null;
        };
    }

    interface User {
        id?: string;
        email?: string | null;
        name?: string | null;
        username?: string | null;
        organizationId?: string | number;
        userType?: string | null;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id?: string;
        organizationId?: string | number;
        userType?: string | null;
        username?: string | null;
    }
}
