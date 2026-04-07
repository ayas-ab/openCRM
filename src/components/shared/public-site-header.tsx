"use client";

import Link from "next/link";
import { Poppins } from "next/font/google";
import { ArrowRight, Blocks, LogIn, Menu, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const headingFont = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export function PublicSiteHeader() {
    const pathname = usePathname();
    const navLinks = useMemo(
        () => [
            { href: "/#about", label: "About", id: "about" },
            { href: "/#modules", label: "Modules", id: "modules" },
            { href: "/#stack", label: "Tech Stack", id: "stack" },
            { href: "/#architecture", label: "Architecture", id: "architecture" },
        ],
        []
    );

    const [activeHref, setActiveHref] = useState(pathname === "/" ? "/#about" : pathname);
    const [hasHydrated, setHasHydrated] = useState(false);

    useEffect(() => {
        setHasHydrated(true);
    }, []);

    useEffect(() => {
        if (pathname !== "/") {
            setActiveHref(pathname);
            return;
        }

        const getHashHref = () => {
            if (window.location.hash) return `/${window.location.hash}`;
            return "/#about";
        };

        setActiveHref(getHashHref());

        const sectionElements = navLinks
            .map((link) => document.getElementById(link.id))
            .filter((element): element is HTMLElement => Boolean(element));

        let frameId: number | null = null;
        const updateActiveSection = () => {
            frameId = null;
            if (sectionElements.length === 0) return;

            const marker = Math.min(Math.max(window.innerHeight * 0.28, 120), 220);
            let activeSection = sectionElements[0];

            for (const section of sectionElements) {
                if (section.getBoundingClientRect().top <= marker) {
                    activeSection = section;
                } else {
                    break;
                }
            }

            const nextHref = `/#${activeSection.id}`;
            setActiveHref((current) => (current === nextHref ? current : nextHref));
        };

        const requestActiveSectionUpdate = () => {
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(updateActiveSection);
        };

        const onHashChange = () => {
            setActiveHref(getHashHref());
            requestActiveSectionUpdate();
        };

        window.addEventListener("scroll", requestActiveSectionUpdate, { passive: true });
        window.addEventListener("resize", requestActiveSectionUpdate);
        window.addEventListener("hashchange", onHashChange);
        requestActiveSectionUpdate();

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            window.removeEventListener("scroll", requestActiveSectionUpdate);
            window.removeEventListener("resize", requestActiveSectionUpdate);
            window.removeEventListener("hashchange", onHashChange);
        };
    }, [pathname, navLinks]);

    return (
        <header className="sticky top-4 z-50 px-3 sm:px-5 lg:px-7">
            <div className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[0_10px_35px_-18px_rgba(37,99,235,0.35)] backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 sm:px-5 lg:px-6">
                <Link href="/" className="group flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-sm transition-transform duration-200 group-hover:scale-[1.03]">
                        <Blocks className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className={`${headingFont.className} bg-gradient-to-r from-sky-700 to-blue-700 bg-clip-text text-xl font-bold leading-none text-transparent`}>
                            openCRM
                        </span>
                        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:block">
                            Metadata CRM
                        </span>
                    </div>
                </Link>

                <nav className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1 md:flex">
                    {navLinks.map((link) => (
                        <TopNavLink
                            key={link.href}
                            href={link.href}
                            pathname={pathname}
                            isActive={activeHref === link.href}
                            onClick={() => setActiveHref(link.href)}
                        >
                            {link.label}
                        </TopNavLink>
                    ))}
                </nav>

                <div className="hidden items-center gap-2 md:flex">
                    <Link href="/login">
                        <Button variant="ghost" size="sm" className="cursor-pointer text-slate-700 hover:bg-slate-100">
                            <LogIn className="mr-1.5 h-4 w-4" />
                            Login
                        </Button>
                    </Link>

                    <Link href="/register">
                        <Button size="sm" className="cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
                            <Sparkles className="mr-1.5 h-4 w-4" />
                            Register
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Button>
                    </Link>
                </div>

                <div className="md:hidden">
                    {!hasHydrated ? (
                        <Button variant="ghost" size="icon" className="h-9 w-9 border border-slate-200 bg-white" aria-label="Open navigation menu">
                            <Menu className="h-5 w-5" />
                        </Button>
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 border border-slate-200 bg-white">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200">
                                <DropdownMenuLabel>Navigation</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {navLinks.map((link) => (
                                    <DropdownMenuItem
                                        key={link.href}
                                        asChild
                                        className={activeHref === link.href ? "bg-slate-100 font-semibold text-slate-900" : ""}
                                    >
                                        <TopNavLink href={link.href} pathname={pathname} onClick={() => setActiveHref(link.href)}>
                                            {link.label}
                                        </TopNavLink>
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/login">
                                        <span className="inline-flex items-center gap-2">
                                            <LogIn className="h-4 w-4" />
                                            Login
                                        </span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/register">Register</Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </header>
    );
}

function TopNavLink({
    href,
    pathname,
    children,
    isActive,
    onClick,
    className,
}: {
    href: string;
    pathname: string;
    children: React.ReactNode;
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
}) {
    const isHashLink = href.startsWith("/#");
    const hashHref = isHashLink ? href.slice(1) : href;
    const classes = `cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-700 hover:bg-white hover:text-slate-900"
    }${className ? ` ${className}` : ""}`;

    if (isHashLink && pathname === "/") {
        return (
            <a
                href={hashHref}
                onClick={onClick}
                className={classes}
                aria-current={isActive ? "page" : undefined}
            >
                {children}
            </a>
        );
    }

    return (
        <Link
            href={href}
            onClick={onClick}
            className={classes}
            aria-current={isActive ? "page" : undefined}
        >
            {children}
        </Link>
    );
}
