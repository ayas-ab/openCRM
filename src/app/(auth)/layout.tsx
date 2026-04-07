import { PublicSiteFooter } from "@/components/shared/public-site-footer";
import { PublicSiteHeader } from "@/components/shared/public-site-header";
import { Bell, BriefcaseBusiness, Building2, CircleUserRound, Headset, ShieldCheck } from "lucide-react";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(145deg,#cfe3ff_0%,#eef4ff_42%,#f8fbff_100%)]">
            <PublicSiteHeader />
            <main className="relative px-4 py-10 sm:px-6 lg:px-8">
                <div className="absolute left-[-90px] top-[80px] h-72 w-72 rounded-full bg-sky-300/22 blur-3xl" />
                <div className="absolute bottom-[-80px] right-[-80px] h-80 w-80 rounded-full bg-blue-400/16 blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.72),transparent_55%)]" />
                <div className="pointer-events-none absolute inset-0">
                    <svg className="absolute inset-0 h-full w-full opacity-55" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <line x1="14" y1="28" x2="31" y2="44" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="31" y1="44" x2="49" y2="29" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="31" y1="44" x2="67" y2="40" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="31" y1="44" x2="26" y2="64" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="49" y1="29" x2="72" y2="25" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="67" y1="40" x2="78" y2="58" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="26" y1="64" x2="54" y2="69" className="stroke-sky-300/70" strokeWidth="0.18" />
                        <line x1="54" y1="69" x2="78" y2="58" className="stroke-sky-300/70" strokeWidth="0.18" />
                    </svg>

                    <WebNode className="left-[12%] top-[23%]" icon={<CircleUserRound className="h-3.5 w-3.5 text-sky-700" />} label="Contact" />
                    <WebNode className="left-[28%] top-[41%]" icon={<Building2 className="h-3.5 w-3.5 text-indigo-700" />} label="Account" />
                    <WebNode className="left-[47%] top-[27%]" icon={<BriefcaseBusiness className="h-3.5 w-3.5 text-blue-700" />} label="Opportunity" />
                    <WebNode className="left-[64%] top-[38%]" icon={<Headset className="h-3.5 w-3.5 text-cyan-700" />} label="Case" />
                    <WebNode className="left-[22%] top-[61%]" icon={<Bell className="h-3.5 w-3.5 text-slate-700" />} label="Queue" />
                    <WebNode className="left-[52%] top-[66%]" icon={<ShieldCheck className="h-3.5 w-3.5 text-sky-700" />} label="Share Rule" />

                    <StatPill className="right-[11%] top-[23%]" text="Open Deals: 24" />
                    <StatPill className="right-[14%] top-[34%]" text="Queue Items: 8" />
                    <StatPill className="right-[18%] top-[46%]" text="Mentions: 5" />
                    <StatPill className="right-[15%] top-[61%]" text="Import Jobs: 2" />
                </div>
                <div className="relative mx-auto flex min-h-[calc(100vh-16rem)] w-full max-w-7xl items-center justify-center">
                    <div className="w-full max-w-md">{children}</div>
                </div>
            </main>
            <PublicSiteFooter />
        </div>
    );
}

function WebNode({
    className,
    icon,
    label,
}: {
    className: string;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <div
            className={`absolute hidden items-center gap-1.5 rounded-lg border border-sky-200/85 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur sm:inline-flex ${className}`}
        >
            {icon}
            {label}
        </div>
    );
}

function StatPill({
    className,
    text,
}: {
    className: string;
    text: string;
}) {
    return (
        <div
            className={`absolute hidden rounded-md border border-indigo-200/80 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur lg:block ${className}`}
        >
            {text}
        </div>
    );
}
