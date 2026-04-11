import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("turnstile security helper", () => {
    const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const originalSecretKey = process.env.TURNSTILE_SECRET_KEY;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        delete process.env.TURNSTILE_SECRET_KEY;
    });

    afterEach(() => {
        if (originalSiteKey === undefined) {
            delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        } else {
            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
        }

        if (originalSecretKey === undefined) {
            delete process.env.TURNSTILE_SECRET_KEY;
        } else {
            process.env.TURNSTILE_SECRET_KEY = originalSecretKey;
        }
    });

    it("bypasses verification when Turnstile is not configured", async () => {
        const { isTurnstileEnabled, verifyTurnstileToken } = await import("@/lib/security/turnstile");

        expect(isTurnstileEnabled()).toBe(false);
        await expect(verifyTurnstileToken(null)).resolves.toEqual({ success: true });
    });

    it("rejects a missing token when Turnstile is enabled", async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
        process.env.TURNSTILE_SECRET_KEY = "secret-key";

        const { verifyTurnstileToken } = await import("@/lib/security/turnstile");

        await expect(verifyTurnstileToken("")).resolves.toMatchObject({
            success: false,
            reason: "missing",
        });
    });

    it("verifies the token against Cloudflare and forwards the remote IP", async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
        process.env.TURNSTILE_SECRET_KEY = "secret-key";

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
        const result = await verifyTurnstileToken("token-123", "203.0.113.10");

        expect(result).toEqual({ success: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({
            "Content-Type": "application/x-www-form-urlencoded",
        });

        const body = init.body as URLSearchParams;
        expect(body.get("secret")).toBe("secret-key");
        expect(body.get("response")).toBe("token-123");
        expect(body.get("remoteip")).toBe("203.0.113.10");
    });

    it("returns a failed result when Cloudflare rejects the token", async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
        process.env.TURNSTILE_SECRET_KEY = "secret-key";

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
            })
        );

        const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
        const result = await verifyTurnstileToken("bad-token");

        expect(result).toMatchObject({
            success: false,
            reason: "failed",
            errorCodes: ["invalid-input-response"],
        });
    });

    it("extracts the best available client IP from request headers", async () => {
        const { getClientIpFromHeaders } = await import("@/lib/security/turnstile");

        const cloudflareHeaders = new Headers({
            "cf-connecting-ip": "198.51.100.1",
            "x-forwarded-for": "203.0.113.10, 203.0.113.11",
        });
        expect(getClientIpFromHeaders(cloudflareHeaders)).toBe("198.51.100.1");

        const forwardedHeaders = new Headers({
            "x-forwarded-for": "203.0.113.10, 203.0.113.11",
        });
        expect(getClientIpFromHeaders(forwardedHeaders)).toBe("203.0.113.10");
    });
});
