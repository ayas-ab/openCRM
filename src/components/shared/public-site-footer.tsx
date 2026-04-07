import { Poppins } from "next/font/google";
import { Blocks } from "lucide-react";

const headingFont = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export function PublicSiteFooter() {
    return (
        <footer className="border-t border-slate-200 bg-slate-50 py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                            <Blocks className="h-4 w-4" />
                        </div>
                        <span className={`${headingFont.className} font-semibold text-slate-900`}>openCRM</span>
                    </div>
                    <p className="text-sm text-slate-600">
                        Open source under MIT license.
                    </p>
                </div>
            </div>
        </footer>
    );
}
