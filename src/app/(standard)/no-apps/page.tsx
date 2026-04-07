import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LockKeyhole, PanelTopOpen, Sparkles, Waypoints, Wrench } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAvailableApps } from "@/lib/permissions";

export default async function NoAppsPage() {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const user = session.user as any;
    const isAdmin = user.userType === "admin";

    const availableApps = await getAvailableApps(parseInt(user.id), parseInt(user.organizationId), user.userType);
    if (availableApps.length > 0) {
        redirect(`/app/${availableApps[0].apiName}`);
    }

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#eef2f7_0%,#e5ebf3_100%)] px-4 py-8 md:px-6 md:py-12">
            <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-3xl items-center justify-center">
                <Card className="w-full overflow-hidden border-slate-300/70 bg-white shadow-[0_24px_64px_-32px_rgba(15,23,42,0.22)]">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-7 sm:px-8 sm:py-8">
                            <div className="flex flex-col gap-5">
                                <div className="flex items-start gap-4">
                                    <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm">
                                        {isAdmin ? <PanelTopOpen className="h-7 w-7" /> : <LockKeyhole className="h-7 w-7" />}
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                                            Workspace Status
                                        </p>
                                        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                                            {isAdmin ? "Create the first app" : "No app available yet"}
                                        </h1>
                                        <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                                            {isAdmin
                                                ? "This organization is ready, but the standard workspace cannot open until at least one app is created and available."
                                                : "Your account is active, but there is no app currently assigned that you can open."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-6 sm:px-8 sm:py-7">
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                                            <Waypoints className="h-4 w-4" />
                                        </div>
                                        <h2 className="text-sm font-semibold text-slate-950">What is missing</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            {isAdmin
                                                ? "There is no app in this workspace yet."
                                                : "There is no assigned app available for this user."}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                                            <Wrench className="h-4 w-4" />
                                        </div>
                                        <h2 className="text-sm font-semibold text-slate-950">Next action</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            {isAdmin
                                                ? "Create an app, add the right objects, and make it available to users using permissionSets."
                                                : "Ask an administrator to grant access to at least one app."}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <h2 className="text-base font-semibold text-slate-950">
                                                {isAdmin ? "Open setup to continue" : "Come back after access is assigned"}
                                            </h2>
                                            <p className="text-sm leading-6 text-slate-600">
                                                {isAdmin
                                                    ? "Once the first app exists, this page will stop appearing and users will be routed into the workspace."
                                                    : "Refresh this page after access is granted and the system will route you into the workspace automatically."}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 flex-wrap gap-3">
                                            {isAdmin ? (
                                                <Button
                                                    asChild
                                                    size="lg"
                                                    className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-950 shadow-[0_14px_30px_-16px_rgba(245,158,11,0.9)] hover:bg-amber-400"
                                                >
                                                    <Link href="/admin">
                                                        <Sparkles className="h-4 w-4" />
                                                        Open Admin
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            ) : (
                                                <Button asChild variant="outline" size="lg" className="h-11 rounded-xl px-5">
                                                    <Link href="/login">Return to Login</Link>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
