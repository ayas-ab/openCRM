import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSearchableObjects } from "@/lib/permissions";
import { GlobalSearchPage } from "@/components/standard/search/global-search-page";

export default async function SearchPage({
    params,
    searchParams,
}: {
    params: Promise<{ appApiName: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const { appApiName } = await params;
    const resolvedSearch = (await searchParams) || {};
    const query = typeof resolvedSearch.q === "string" ? resolvedSearch.q : "";
    const objectFilter = typeof resolvedSearch.object === "string" ? resolvedSearch.object : "";

    const user = session.user as any;
    const userId = parseInt(user.id);
    const organizationId = parseInt(user.organizationId);

    const objects = await getSearchableObjects(userId, organizationId);

    return (
        <div className="px-6 py-6">
            <GlobalSearchPage
                appApiName={appApiName}
                objects={objects.map((obj) => ({ id: obj.id, apiName: obj.apiName, label: obj.label }))}
                initialQuery={query}
                initialObject={objectFilter}
            />
        </div>
    );
}
