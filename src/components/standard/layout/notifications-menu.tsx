"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AtSign, Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Link from "next/link";
import { cn } from "@/lib/utils";

type NotificationItem = {
    id: number;
    message: string;
    createdAt: string;
    isRead: boolean;
    recordId: number | null;
    type: string;
    objectApiName: string | null;
};

export function NotificationsMenu({ currentAppApiName }: { currentAppApiName?: string | null }) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/notifications", { cache: "no-store" });
            if (!response.ok) {
                setNotifications([]);
                setUnreadCount(0);
                return;
            }
            const data = await response.json();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
        } catch {
            setNotifications([]);
            setUnreadCount(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();

        const interval = setInterval(fetchNotifications, 15000);
        const onFocus = () => fetchNotifications();
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                fetchNotifications();
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            clearInterval(interval);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [pathname]);

    useEffect(() => {
        if (open) {
            fetchNotifications();
        }
    }, [open]);

    const markAllRead = async () => {
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true }),
            });
            fetchNotifications();
        } catch {
            // ignore
        }
    };

    const markNotificationRead = async (id: number) => {
        setNotifications((prev) =>
            prev.map((notification) =>
                notification.id === id ? { ...notification, isRead: true } : notification
            )
        );
        setUnreadCount((count) => Math.max(0, count - 1));
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [id] }),
            });
        } catch {
            fetchNotifications();
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-rose-500 px-1 text-xs font-semibold text-white flex items-center justify-center">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <div className="text-sm font-semibold">Notifications</div>
                        <div className="text-xs text-muted-foreground">
                            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
                        <Check className="mr-1 h-4 w-4" />
                        Mark all read
                    </Button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {loading && (
                        <div className="px-4 py-6 text-sm text-muted-foreground">Loading notifications...</div>
                    )}
                    {!loading && notifications.length === 0 && (
                        <div className="px-4 py-6 text-sm text-muted-foreground">No notifications yet.</div>
                    )}
                    {!loading &&
                        notifications.map((notification) => {
                            const createdAt = new Date(notification.createdAt).toLocaleString();
                            const isMention = notification.type === "COMMENT_MENTION";
                            return (
                                <div
                                    key={notification.id}
                                    className={cn(
                                        "border-b px-4 py-3 text-sm transition-colors",
                                        notification.isRead
                                            ? "bg-white"
                                            : "bg-rose-50 border-l-4 border-l-rose-300"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium text-slate-900">{notification.message}</div>
                                        {isMention && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                                                <AtSign className="h-3 w-3" />
                                                Mention
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">{createdAt}</div>
                                    {notification.recordId && notification.objectApiName && currentAppApiName && (
                                        <Link
                                            href={`/app/${currentAppApiName}/${notification.objectApiName}/${notification.recordId}`}
                                            className="text-xs text-primary mt-2 inline-block hover:underline"
                                            onClick={() => {
                                                if (!notification.isRead) {
                                                    markNotificationRead(notification.id);
                                                }
                                            }}
                                        >
                                            View record
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
