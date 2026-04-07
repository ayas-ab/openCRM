import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { MetadataDependencyDetail } from "@/lib/metadata-dependencies";

const SOURCE_TYPE_LABELS: Record<string, string> = {
    FIELD_DEFINITION: "Fields",
    ASSIGNMENT_RULE: "Assignment Rules",
    SHARING_RULE: "Sharing Rules",
    VALIDATION_RULE: "Validation Rules",
    LIST_VIEW: "List Views",
    DASHBOARD_WIDGET: "Dashboard Widgets",
    RECORD_PAGE_LAYOUT: "Record Page Layouts",
    APP: "Apps",
};

const REFERENCE_KIND_LABELS: Record<string, string> = {
    LOOKUP_TARGET_OBJECT: "Lookup target",
    // Historical name from the dependency enum. In current UI this means the
    // metadata item is attached to / runs against the object.
    TRIGGER_OBJECT: "Base object",
    CRITERIA_FIELD: "Criteria field",
    CONDITION_FIELD: "Condition field",
    COMPARE_FIELD: "Compare field",
    ERROR_FIELD: "Inline error field",
    COLUMN_FIELD: "Column field",
    SORT_FIELD: "Sort field",
    KANBAN_FIELD: "Kanban field",
    VALUE_FIELD: "Value field",
    GROUP_BY_FIELD: "Group-by field",
    LAYOUT_FIELD: "Layout field",
    VISIBILITY_FIELD: "Visibility rule field",
    HIGHLIGHT_FIELD: "Highlight field",
    NAV_OBJECT: "Navigation object",
};

type DependencySourceGroup = {
    sourceType: string;
    sourceId: number;
    sourceLabel: string;
    editUrl: string | null;
    items: MetadataDependencyDetail[];
};

function buildReferenceLabel(dependency: MetadataDependencyDetail) {
    const kindLabel = REFERENCE_KIND_LABELS[dependency.referenceKind] ?? dependency.referenceKind;
    if (dependency.referencedFieldLabel) {
        return `${kindLabel}: ${dependency.referencedFieldLabel}`;
    }
    if (dependency.referencedObjectLabel) {
        return `${kindLabel}: ${dependency.referencedObjectLabel}`;
    }
    return kindLabel;
}

function groupDependencies(dependencies: MetadataDependencyDetail[]) {
    const groups = new Map<string, DependencySourceGroup[]>();
    dependencies.forEach((dependency) => {
        const typeKey = dependency.sourceType;
        const typeGroups = groups.get(typeKey) ?? [];
        const existing = typeGroups.find(
            (group) => group.sourceId === dependency.sourceId && group.sourceType === dependency.sourceType
        );

        if (existing) {
            existing.items.push(dependency);
        } else {
            typeGroups.push({
                sourceType: dependency.sourceType,
                sourceId: dependency.sourceId,
                sourceLabel: dependency.sourceLabel,
                editUrl: dependency.editUrl,
                items: [dependency],
            });
        }

        groups.set(typeKey, typeGroups);
    });

    return Array.from(groups.entries()).map(([sourceType, items]) => ({
        sourceType,
        label: SOURCE_TYPE_LABELS[sourceType] ?? sourceType,
        items: items.map((item) => ({
            ...item,
            items: item.items
                .slice()
                .sort((a, b) => buildReferenceLabel(a).localeCompare(buildReferenceLabel(b)))
                .filter((dependency, index, all) => {
                    const firstIndex = all.findIndex((candidate) =>
                        buildReferenceLabel(candidate) === buildReferenceLabel(dependency)
                    );
                    return firstIndex === index;
                }),
        })),
    }));
}

export function DependencyList({
    dependencies,
    emptyMessage = "No dependencies found.",
}: {
    dependencies: MetadataDependencyDetail[];
    emptyMessage?: string;
}) {
    if (!dependencies.length) {
        return (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                {emptyMessage}
            </div>
        );
    }

    const groups = groupDependencies(dependencies);

    return (
        <div className="space-y-4">
            {groups.map((group) => (
                <div key={group.sourceType} className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {group.items.map((dependency) => (
                            <div
                                key={`${dependency.sourceType}-${dependency.sourceId}`}
                                className="flex items-start justify-between gap-4 px-4 py-3"
                            >
                                <div className="min-w-0 space-y-1">
                                    <div className="text-sm font-medium text-slate-900">
                                        {dependency.sourceLabel}
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {dependency.items.map((item) => (
                                            <span
                                                key={item.id}
                                                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                                            >
                                                {buildReferenceLabel(item)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                {dependency.editUrl ? (
                                    <Link
                                        href={dependency.editUrl}
                                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                                    >
                                        Open
                                        <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
