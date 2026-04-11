const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

type TurnstileVerifyResponse = {
    success: boolean;
    "error-codes"?: string[];
};

export function isTurnstileEnabled() {
    return TURNSTILE_SITE_KEY.length > 0;
}

export function getTurnstileSiteKey() {
    return TURNSTILE_SITE_KEY;
}

export function getClientIpFromHeaders(headers: Headers) {
    const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
    if (cfConnectingIp) {
        return cfConnectingIp;
    }

    const forwardedFor = headers.get("x-forwarded-for")?.trim();
    if (!forwardedFor) {
        return null;
    }

    const [firstIp] = forwardedFor.split(",");
    return firstIp?.trim() || null;
}

export async function verifyTurnstileToken(token: string | null | undefined, remoteIp?: string | null) {
    if (!isTurnstileEnabled()) {
        return { success: true as const };
    }

    if (!TURNSTILE_SECRET_KEY) {
        return {
            success: false as const,
            reason: "unavailable" as const,
        };
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
        return {
            success: false as const,
            reason: "missing" as const,
        };
    }

    try {
        const body = new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: normalizedToken,
        });

        if (remoteIp) {
            body.set("remoteip", remoteIp);
        }

        const response = await fetch(TURNSTILE_VERIFY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return {
                success: false as const,
                reason: "failed" as const,
            };
        }

        const payload = (await response.json()) as TurnstileVerifyResponse;
        if (!payload.success) {
            return {
                success: false as const,
                reason: "failed" as const,
                errorCodes: payload["error-codes"] ?? [],
            };
        }

        return { success: true as const };
    } catch {
        return {
            success: false as const,
            reason: "failed" as const,
        };
    }
}
