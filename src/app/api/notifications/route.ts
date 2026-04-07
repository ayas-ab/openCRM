import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = Number(session.user.id ?? NaN);
    const organizationId = Number(session.user.organizationId ?? NaN);

    if (isNaN(userId) || isNaN(organizationId)) {
        return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const [notifications, unreadCount] = await Promise.all([
        db.notification.findMany({
            where: { organizationId, userId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
                id: true,
                message: true,
                createdAt: true,
                isRead: true,
                recordId: true,
                type: true,
                record: {
                    select: {
                        objectDef: {
                            select: {
                                apiName: true,
                            },
                        },
                    },
                },
            },
        }),
        db.notification.count({
            where: { organizationId, userId, isRead: false },
        }),
    ]);

    const normalized = notifications.map((notification) => ({
        id: notification.id,
        message: notification.message,
        createdAt: notification.createdAt,
        isRead: notification.isRead,
        recordId: notification.recordId,
        type: notification.type,
        objectApiName: notification.record?.objectDef?.apiName ?? null,
    }));

    return NextResponse.json({ notifications: normalized, unreadCount });
}

export async function PATCH(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = Number(session.user.id ?? NaN);
    const organizationId = Number(session.user.organizationId ?? NaN);

    if (isNaN(userId) || isNaN(organizationId)) {
        return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    let payload: { ids?: number[]; all?: boolean } = {};
    try {
        payload = await request.json();
    } catch {
        payload = {};
    }

    if (payload.all) {
        await db.notification.updateMany({
            where: { organizationId, userId, isRead: false },
            data: { isRead: true },
        });
        return NextResponse.json({ success: true });
    }

    const ids = (payload.ids || []).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
        return NextResponse.json({ success: false, error: "No notifications selected." }, { status: 400 });
    }

    await db.notification.updateMany({
        where: {
            organizationId,
            userId,
            id: { in: ids },
        },
        data: { isRead: true },
    });

    return NextResponse.json({ success: true });
}
