import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, ShieldCheck, UserPlus, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { DemoDataButton } from "@/components/admin/demo-data-button";

export default function AdminDashboardPage() {
    return (
        <div className="space-y-8">
            {/* Header */}
           
                <DemoDataButton />
           

            {/* How It Works Section */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-foreground">
                        Setup Guide
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Follow these steps to configure your custom CRM application.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">

                    {/* Step 1 */}
                    <Card className="shadow-sm border-border/60 hover:shadow-md transition-all group overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/80"></div>
                        <CardHeader className="pb-2">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <Database className="h-5 w-5 text-blue-600" />
                            </div>
                            <CardTitle className="text-base font-semibold">1. Data Foundation</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-3">
                            <p>Start by defining your data structure in the <strong>Object Manager</strong>.</p>
                            <ul className="list-disc pl-4 space-y-1 text-xs marker:text-blue-500">
                                <li>Create <strong>Objects</strong> (e.g. Projects)</li>
                                <li>Add custom <strong>Fields</strong></li>
                                <li>Set lookup targets early (they lock after creation)</li>
                                <li>Configure record page layouts and highlights</li>
                            </ul>
                            <Link href="/admin/objects" className="text-xs font-semibold text-blue-600 hover:underline">
                                Open Object Manager
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Step 2 */}
                    <Card className="shadow-sm border-border/60 hover:shadow-md transition-all group overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/80"></div>
                        <CardHeader className="pb-2">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <LayoutDashboard className="h-5 w-5 text-purple-600" />
                            </div>
                            <CardTitle className="text-base font-semibold">2. App Construction</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-3">
                            <p>Group objects into functional Apps in the <strong>App Manager</strong>.</p>
                            <ul className="list-disc pl-4 space-y-1 text-xs marker:text-purple-500">
                                <li>Create <strong>App</strong> containers</li>
                                <li>Configure <strong>Navigation</strong></li>
                                <li>Design Dashboard <strong>Widgets</strong></li>
                                <li>Assign apps to permission sets</li>
                            </ul>
                            <Link href="/admin/apps" className="text-xs font-semibold text-purple-600 hover:underline">
                                Open App Builder
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Step 3 */}
                    <Card className="shadow-sm border-border/60 hover:shadow-md transition-all group overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/80"></div>
                        <CardHeader className="pb-2">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <ShieldCheck className="h-5 w-5 text-amber-600" />
                            </div>
                            <CardTitle className="text-base font-semibold">3. Security Model</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-3">
                            <p>Control access specific data via <strong>Permission Sets</strong>.</p>
                            <ul className="list-disc pl-4 space-y-1 text-xs marker:text-amber-500">
                                <li>Define <strong>Permission Sets</strong></li>
                                <li>Set Object Access (CRUD)</li>
                                <li>Create Permission Groups</li>
                                <li>Configure queues and sharing rules</li>
                                <li>Add duplicate rules for create/edit warning or block behavior</li>
                                <li>Set assignment rules for auto‑routing</li>
                            </ul>
                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                                <Link href="/admin/permissions" className="text-amber-600 hover:underline">
                                    Permission Sets
                                </Link>
                                <span className="text-amber-400">•</span>
                                <Link href="/admin/queues" className="text-amber-600 hover:underline">
                                    Queues
                                </Link>
                                <span className="text-amber-400">•</span>
                                <Link href="/admin/sharing-rules" className="text-amber-600 hover:underline">
                                    Sharing Rules
                                </Link>
                                <span className="text-amber-400">•</span>
                                <Link href="/admin/duplicate-rules" className="text-amber-600 hover:underline">
                                    Duplicate Rules
                                </Link>
                                <span className="text-amber-400">•</span>
                                <Link href="/admin/assignment-rules" className="text-amber-600 hover:underline">
                                    Assignment Rules
                                </Link>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Step 4 */}
                    <Card className="shadow-sm border-border/60 hover:shadow-md transition-all group overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/80"></div>
                        <CardHeader className="pb-2">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <UserPlus className="h-5 w-5 text-emerald-600" />
                            </div>
                            <CardTitle className="text-base font-semibold">4. User Access</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-3">
                            <p>Onboard your team in the <strong>User Management</strong> area.</p>
                            <ul className="list-disc pl-4 space-y-1 text-xs marker:text-emerald-500">
                                <li>Invite <strong>Users</strong></li>
                                <li>Assign Role & Permissions</li>
                                <li>Monitor adoption</li>
                                <li>Add users to groups and queues</li>
                            </ul>
                            <Link href="/admin/users" className="text-xs font-semibold text-emerald-600 hover:underline">
                                Open User Management
                            </Link>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    );
}
