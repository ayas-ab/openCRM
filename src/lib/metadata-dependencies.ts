import { db } from "@/lib/db";
import { normalizeRecordPageLayoutConfig } from "@/lib/record-page-layout";
import {
    MetadataDependencyReferenceKind,
    MetadataDependencySourceType,
    Prisma,
} from "@prisma/client";

const BUILT_IN_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name"]);

type DependencyInput = {
    objectDefId?: number | null;
    fieldDefId?: number | null;
    referenceKind: MetadataDependencyReferenceKind;
    sourcePath?: string | null;
    isBlockingDelete?: boolean;
};

type ReplaceSourceInput = {
    organizationId: number;
    sourceType: MetadataDependencySourceType;
    sourceId: number;
    sourceLabel: string;
    sourceObjectDefId?: number | null;
    sourceAppId?: number | null;
    dependencies: DependencyInput[];
};

export type MetadataDependencyDetail = {
    id: number;
    sourceType: MetadataDependencySourceType;
    sourceId: number;
    sourceLabel: string;
    sourcePath: string | null;
    sourceObjectDefId: number | null;
    sourceAppId: number | null;
    objectDefId: number | null;
    fieldDefId: number | null;
    referenceKind: MetadataDependencyReferenceKind;
    isBlockingDelete: boolean;
    editUrl: string | null;
    referencedObjectLabel: string | null;
    referencedFieldLabel: string | null;
    referencedFieldApiName: string | null;
};

type DbLike = Prisma.TransactionClient | typeof db;

// These sources belong to the object's own metadata boundary. They still appear
// in "Used In", but they should not block deleting the whole object because
// they are expected to disappear with it.
const OBJECT_OWNED_SOURCE_TYPES = new Set<MetadataDependencySourceType>([
    MetadataDependencySourceType.FIELD_DEFINITION,
    MetadataDependencySourceType.ASSIGNMENT_RULE,
    MetadataDependencySourceType.SHARING_RULE,
    MetadataDependencySourceType.DUPLICATE_RULE,
    MetadataDependencySourceType.VALIDATION_RULE,
    MetadataDependencySourceType.LIST_VIEW,
    MetadataDependencySourceType.RECORD_PAGE_LAYOUT,
]);

function normalizeDependencies(dependencies: DependencyInput[]) {
    const seen = new Set<string>();
    return dependencies
        .filter((dependency) => dependency.objectDefId || dependency.fieldDefId)
        .filter((dependency) => {
            const key = [
                dependency.objectDefId ?? "",
                dependency.fieldDefId ?? "",
                dependency.referenceKind,
                dependency.sourcePath ?? "",
            ].join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

async function loadFieldMaps(tx: DbLike, objectDefId: number) {
    const fields = await tx.fieldDefinition.findMany({
        where: { objectDefId },
        select: { id: true, apiName: true, label: true, type: true, required: true },
        orderBy: { id: "asc" },
    });
    const byId = new Map(fields.map((field) => [field.id, field]));
    const byApiName = new Map(fields.map((field) => [field.apiName, field]));
    return { fields, byId, byApiName };
}

function resolveFieldId(
    filter: { fieldDefId?: number | null; field?: string | null },
    fieldById: Map<number, { id: number }>,
    fieldByApiName: Map<string, { id: number }>
) {
    if (filter.fieldDefId && fieldById.has(filter.fieldDefId)) {
        return filter.fieldDefId;
    }
    if (filter.field) {
        return fieldByApiName.get(filter.field)?.id ?? null;
    }
    return null;
}

function getCriteriaFilters(criteria: unknown) {
    if (!criteria || typeof criteria !== "object") return [];
    const maybeFilters = (criteria as { filters?: unknown }).filters;
    if (!Array.isArray(maybeFilters)) return [];
    return maybeFilters as Array<{ fieldDefId?: number; field?: string; operator?: string; value?: string }>;
}

function buildDependencyEditUrl(detail: {
    sourceType: MetadataDependencySourceType;
    sourceId: number;
    sourceObjectDefId: number | null;
    sourceAppId: number | null;
}) {
    switch (detail.sourceType) {
        case MetadataDependencySourceType.FIELD_DEFINITION:
            return detail.sourceObjectDefId ? `/admin/objects/${detail.sourceObjectDefId}` : null;
        case MetadataDependencySourceType.ASSIGNMENT_RULE:
            return detail.sourceObjectDefId ? `/admin/assignment-rules/${detail.sourceObjectDefId}/${detail.sourceId}` : null;
        case MetadataDependencySourceType.SHARING_RULE:
            return detail.sourceObjectDefId ? `/admin/sharing-rules/${detail.sourceObjectDefId}/${detail.sourceId}` : null;
        case MetadataDependencySourceType.DUPLICATE_RULE:
            return detail.sourceObjectDefId ? `/admin/duplicate-rules/${detail.sourceObjectDefId}/${detail.sourceId}` : null;
        case MetadataDependencySourceType.VALIDATION_RULE:
            return detail.sourceObjectDefId ? `/admin/objects/${detail.sourceObjectDefId}/validation-rules/${detail.sourceId}` : null;
        case MetadataDependencySourceType.LIST_VIEW:
            return detail.sourceObjectDefId ? `/admin/objects/${detail.sourceObjectDefId}` : null;
        case MetadataDependencySourceType.DASHBOARD_WIDGET:
            return detail.sourceAppId ? `/admin/apps/${detail.sourceAppId}/builder` : null;
        case MetadataDependencySourceType.RECORD_PAGE_LAYOUT:
            return detail.sourceObjectDefId ? `/admin/objects/${detail.sourceObjectDefId}/record-pages/${detail.sourceId}` : null;
        case MetadataDependencySourceType.APP:
            return `/admin/apps/${detail.sourceId}`;
        default:
            return null;
    }
}

export async function replaceDependenciesForSource(tx: DbLike, input: ReplaceSourceInput) {
    const dependencies = normalizeDependencies(input.dependencies);

    // Dependency rows are always replaced wholesale per source record so the
    // index stays deterministic even when JSON configs change shape over time.
    await tx.metadataDependency.deleteMany({
        where: {
            organizationId: input.organizationId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
        },
    });

    if (!dependencies.length) return;

    await tx.metadataDependency.createMany({
        data: dependencies.map((dependency) => ({
            organizationId: input.organizationId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceLabel: input.sourceLabel,
            sourcePath: dependency.sourcePath ?? null,
            sourceObjectDefId: input.sourceObjectDefId ?? null,
            sourceAppId: input.sourceAppId ?? null,
            objectDefId: dependency.objectDefId ?? null,
            fieldDefId: dependency.fieldDefId ?? null,
            referenceKind: dependency.referenceKind,
            isBlockingDelete: dependency.isBlockingDelete ?? true,
        })),
    });
}

export async function removeDependenciesForSource(
    tx: DbLike,
    organizationId: number,
    sourceType: MetadataDependencySourceType,
    sourceId: number
) {
    await tx.metadataDependency.deleteMany({
        where: { organizationId, sourceType, sourceId },
    });
}

async function enrichDependencyRows(rows: any[]) {
    const objectIds = Array.from(
        new Set(
            rows
                .map((row) => row.objectDefId)
                .filter((value): value is number => typeof value === "number")
        )
    );
    const fieldIds = Array.from(
        new Set(
            rows
                .map((row) => row.fieldDefId)
                .filter((value): value is number => typeof value === "number")
        )
    );

    const [objects, fields] = await Promise.all([
        objectIds.length
            ? db.objectDefinition.findMany({
                where: { id: { in: objectIds } },
                select: { id: true, label: true },
            })
            : Promise.resolve([]),
        fieldIds.length
            ? db.fieldDefinition.findMany({
                where: { id: { in: fieldIds } },
                select: { id: true, label: true, apiName: true },
            })
            : Promise.resolve([]),
    ]);

    const objectLabels = new Map(objects.map((objectDef) => [objectDef.id, objectDef.label]));
    const fieldMeta = new Map(fields.map((field) => [field.id, field]));

    return rows.map((row) => ({
        id: row.id,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceLabel: row.sourceLabel,
        sourcePath: row.sourcePath ?? null,
        sourceObjectDefId: row.sourceObjectDefId ?? null,
        sourceAppId: row.sourceAppId ?? null,
        objectDefId: row.objectDefId ?? null,
        fieldDefId: row.fieldDefId ?? null,
        referenceKind: row.referenceKind,
        isBlockingDelete: row.isBlockingDelete,
        editUrl: buildDependencyEditUrl(row),
        referencedObjectLabel:
            typeof row.objectDefId === "number" ? objectLabels.get(row.objectDefId) ?? null : null,
        referencedFieldLabel:
            typeof row.fieldDefId === "number" ? fieldMeta.get(row.fieldDefId)?.label ?? null : null,
        referencedFieldApiName:
            typeof row.fieldDefId === "number" ? fieldMeta.get(row.fieldDefId)?.apiName ?? null : null,
    }));
}

export async function getFieldDependencies(organizationId: number, fieldDefId: number) {
    const rows = await db.metadataDependency.findMany({
        where: {
            organizationId,
            fieldDefId,
            isBlockingDelete: true,
        },
        orderBy: [{ sourceType: "asc" }, { sourceLabel: "asc" }, { sourcePath: "asc" }],
    });
    return enrichDependencyRows(rows);
}

export async function getObjectDependencies(organizationId: number, objectDefId: number) {
    const fields = await db.fieldDefinition.findMany({
        where: { objectDefId },
        select: { id: true },
    });
    const fieldIds = fields.map((field) => field.id);
    const rows = await db.metadataDependency.findMany({
        where: {
            organizationId,
            isBlockingDelete: true,
            OR: [
                { objectDefId },
                ...(fieldIds.length ? [{ fieldDefId: { in: fieldIds } }] : []),
            ],
        },
        orderBy: [{ sourceType: "asc" }, { sourceLabel: "asc" }, { sourcePath: "asc" }],
    });
    return enrichDependencyRows(rows);
}

function isInternalObjectDependency(detail: MetadataDependencyDetail, objectDefId: number) {
    return (
        detail.sourceObjectDefId === objectDefId &&
        OBJECT_OWNED_SOURCE_TYPES.has(detail.sourceType)
    );
}

export function filterObjectDeleteBlockingDependencies(
    dependencies: MetadataDependencyDetail[],
    objectDefId: number
) {
    // Field delete is strict, but object delete only blocks on external
    // references. Internal child metadata should be cleaned up with the object.
    return dependencies.filter((detail) => !isInternalObjectDependency(detail, objectDefId));
}

export async function getObjectDeleteProtection(organizationId: number, objectDefId: number) {
    const [allDependencies, recordCount] = await Promise.all([
        getObjectDependencies(organizationId, objectDefId),
        db.record.count({
            where: {
                organizationId,
                objectDefId,
            },
        }),
    ]);

    const dependencies = filterObjectDeleteBlockingDependencies(allDependencies, objectDefId);

    return { dependencies, allDependencies, recordCount };
}

export async function syncFieldDefinitionDependencies(tx: DbLike, fieldId: number, organizationId: number) {
    const field = await tx.fieldDefinition.findFirst({
        where: {
            id: fieldId,
            objectDef: { organizationId },
        },
        include: {
            objectDef: { select: { label: true } },
        },
    });

    if (!field) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.FIELD_DEFINITION, fieldId);
        return;
    }

    const dependencies: DependencyInput[] = [];
    if (field.type === "Lookup" && field.lookupTargetId) {
        dependencies.push({
            objectDefId: field.lookupTargetId,
            referenceKind: MetadataDependencyReferenceKind.LOOKUP_TARGET_OBJECT,
            sourcePath: "lookupTargetId",
        });
    }

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.FIELD_DEFINITION,
        sourceId: field.id,
        sourceLabel: `${field.objectDef.label}: ${field.label}`,
        sourceObjectDefId: field.objectDefId,
        dependencies,
    });
}

export async function syncAssignmentRuleDependencies(tx: DbLike, ruleId: number, organizationId: number) {
    const rule = await tx.assignmentRule.findFirst({
        where: { id: ruleId, organizationId },
        include: {
            objectDef: { select: { label: true } },
        },
    });

    if (!rule) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.ASSIGNMENT_RULE, ruleId);
        return;
    }

    const { byId, byApiName } = await loadFieldMaps(tx, rule.objectDefId);
    const dependencies: DependencyInput[] = [
        {
            objectDefId: rule.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    getCriteriaFilters(rule.criteria).forEach((filter, index) => {
        const fieldDefId = resolveFieldId(filter, byId, byApiName);
        if (!fieldDefId) return;
        dependencies.push({
            fieldDefId,
            referenceKind: MetadataDependencyReferenceKind.CRITERIA_FIELD,
            sourcePath: `criteria.filters[${index}]`,
        });
    });

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.ASSIGNMENT_RULE,
        sourceId: rule.id,
        sourceLabel: rule.name,
        sourceObjectDefId: rule.objectDefId,
        dependencies,
    });
}

export async function syncSharingRuleDependencies(tx: DbLike, ruleId: number, organizationId: number) {
    const rule = await tx.sharingRule.findFirst({
        where: { id: ruleId, organizationId },
        include: {
            objectDef: { select: { label: true } },
        },
    });

    if (!rule) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.SHARING_RULE, ruleId);
        return;
    }

    const { byId, byApiName } = await loadFieldMaps(tx, rule.objectDefId);
    const dependencies: DependencyInput[] = [
        {
            objectDefId: rule.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    getCriteriaFilters(rule.criteria).forEach((filter, index) => {
        const fieldDefId = resolveFieldId(filter, byId, byApiName);
        if (!fieldDefId) return;
        dependencies.push({
            fieldDefId,
            referenceKind: MetadataDependencyReferenceKind.CRITERIA_FIELD,
            sourcePath: `criteria.filters[${index}]`,
        });
    });

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.SHARING_RULE,
        sourceId: rule.id,
        sourceLabel: rule.name,
        sourceObjectDefId: rule.objectDefId,
        dependencies,
    });
}

export async function syncDuplicateRuleDependencies(tx: DbLike, ruleId: number, organizationId: number) {
    const rule = await tx.duplicateRule.findFirst({
        where: { id: ruleId, organizationId },
        include: {
            conditions: {
                select: {
                    fieldDefId: true,
                    sortOrder: true,
                },
                orderBy: { sortOrder: "asc" },
            },
        },
    });

    if (!rule) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.DUPLICATE_RULE, ruleId);
        return;
    }

    const dependencies: DependencyInput[] = [
        {
            objectDefId: rule.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    rule.conditions.forEach((condition, index) => {
        dependencies.push({
            fieldDefId: condition.fieldDefId,
            referenceKind: MetadataDependencyReferenceKind.CRITERIA_FIELD,
            sourcePath: `conditions[${index}]`,
        });
    });

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.DUPLICATE_RULE,
        sourceId: rule.id,
        sourceLabel: rule.name,
        sourceObjectDefId: rule.objectDefId,
        dependencies,
    });
}

export async function syncValidationRuleDependencies(tx: DbLike, ruleId: number, organizationId: number) {
    const rule = await tx.validationRule.findFirst({
        where: {
            id: ruleId,
            objectDef: { organizationId },
        },
        include: {
            objectDef: { select: { label: true } },
            conditions: true,
        },
    });

    if (!rule) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.VALIDATION_RULE, ruleId);
        return;
    }

    const dependencies: DependencyInput[] = [
        {
            objectDefId: rule.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    if (rule.errorFieldId) {
        dependencies.push({
            fieldDefId: rule.errorFieldId,
            referenceKind: MetadataDependencyReferenceKind.ERROR_FIELD,
            sourcePath: "errorFieldId",
        });
    }

    rule.conditions.forEach((condition, index) => {
        if (condition.fieldDefId) {
            dependencies.push({
                fieldDefId: condition.fieldDefId,
                referenceKind: MetadataDependencyReferenceKind.CONDITION_FIELD,
                sourcePath: `conditions[${index}].fieldDefId`,
            });
        }
        if (condition.compareFieldId) {
            dependencies.push({
                fieldDefId: condition.compareFieldId,
                referenceKind: MetadataDependencyReferenceKind.COMPARE_FIELD,
                sourcePath: `conditions[${index}].compareFieldId`,
            });
        }
    });

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.VALIDATION_RULE,
        sourceId: rule.id,
        sourceLabel: rule.name,
        sourceObjectDefId: rule.objectDefId,
        dependencies,
    });
}

export async function syncListViewDependencies(tx: DbLike, listViewId: number, organizationId: number) {
    const listView = await tx.listView.findFirst({
        where: { id: listViewId, organizationId },
        include: {
            objectDef: { select: { label: true } },
            columns: true,
        },
    });

    if (!listView) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.LIST_VIEW, listViewId);
        return;
    }

    const { byId, byApiName } = await loadFieldMaps(tx, listView.objectDefId);
    const dependencies: DependencyInput[] = [
        {
            objectDefId: listView.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    listView.columns.forEach((column, index) => {
        dependencies.push({
            fieldDefId: column.fieldDefId,
            referenceKind: MetadataDependencyReferenceKind.COLUMN_FIELD,
            sourcePath: `columns[${index}]`,
        });
    });

    getCriteriaFilters(listView.criteria).forEach((filter, index) => {
        const fieldDefId = resolveFieldId(filter, byId, byApiName);
        if (!fieldDefId) return;
        dependencies.push({
            fieldDefId,
            referenceKind: MetadataDependencyReferenceKind.CRITERIA_FIELD,
            sourcePath: `criteria.filters[${index}]`,
        });
    });

    if (listView.sortField && !BUILT_IN_SORT_FIELDS.has(listView.sortField)) {
        const sortFieldId = byApiName.get(listView.sortField)?.id;
        if (sortFieldId) {
            dependencies.push({
                fieldDefId: sortFieldId,
                referenceKind: MetadataDependencyReferenceKind.SORT_FIELD,
                sourcePath: "sortField",
            });
        }
    }

    if (listView.kanbanGroupByFieldDefId) {
        dependencies.push({
            fieldDefId: listView.kanbanGroupByFieldDefId,
            referenceKind: MetadataDependencyReferenceKind.KANBAN_FIELD,
            sourcePath: "kanbanGroupByFieldDefId",
        });
    }

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.LIST_VIEW,
        sourceId: listView.id,
        sourceLabel: listView.name,
        sourceObjectDefId: listView.objectDefId,
        dependencies,
    });
}

export async function syncDashboardWidgetDependencies(tx: DbLike, widgetId: number, organizationId: number) {
    const widget = await tx.dashboardWidget.findFirst({
        where: {
            id: widgetId,
            app: { organizationId },
        },
        include: {
            objectDef: { select: { label: true } },
        },
    });

    if (!widget) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.DASHBOARD_WIDGET, widgetId);
        return;
    }

    const dependencies: DependencyInput[] = [
        {
            objectDefId: widget.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    const config = widget.config && typeof widget.config === "object" && !Array.isArray(widget.config)
        ? (widget.config as Record<string, unknown>)
        : {};

    // Widget config is partially JSON-backed, so we normalize the known field
    // reference slots here instead of relying on ad hoc scans during delete.
    const fieldRefs = [
        { key: "valueFieldDefId", kind: MetadataDependencyReferenceKind.VALUE_FIELD },
        { key: "groupByFieldDefId", kind: MetadataDependencyReferenceKind.GROUP_BY_FIELD },
        { key: "sortFieldDefId", kind: MetadataDependencyReferenceKind.SORT_FIELD },
        { key: "kanbanGroupByFieldDefId", kind: MetadataDependencyReferenceKind.KANBAN_FIELD },
    ] as const;

    fieldRefs.forEach(({ key, kind }) => {
        const value = config[key];
        if (typeof value === "number") {
            dependencies.push({
                fieldDefId: value,
                referenceKind: kind,
                sourcePath: `config.${key}`,
            });
        }
    });

    if (Array.isArray(config.fieldDefIds)) {
        config.fieldDefIds.forEach((fieldDefId, index) => {
            if (typeof fieldDefId !== "number") return;
            dependencies.push({
                fieldDefId,
                referenceKind: MetadataDependencyReferenceKind.COLUMN_FIELD,
                sourcePath: `config.fieldDefIds[${index}]`,
            });
        });
    }

    if (Array.isArray(config.filters)) {
        (config.filters as Array<{ fieldDefId?: number }>).forEach((filter, index) => {
            if (!filter.fieldDefId) return;
            dependencies.push({
                fieldDefId: filter.fieldDefId,
                referenceKind: MetadataDependencyReferenceKind.CRITERIA_FIELD,
                sourcePath: `config.filters[${index}]`,
            });
        });
    }

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.DASHBOARD_WIDGET,
        sourceId: widget.id,
        sourceLabel: widget.title,
        sourceObjectDefId: widget.objectDefId,
        sourceAppId: widget.appId,
        dependencies,
    });
}

export async function syncRecordPageLayoutDependencies(tx: DbLike, layoutId: number, organizationId: number) {
    const layout = await tx.recordPageLayout.findFirst({
        where: { id: layoutId, organizationId },
        include: {
            objectDef: {
                select: { label: true },
            },
        },
    });

    if (!layout) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.RECORD_PAGE_LAYOUT, layoutId);
        return;
    }

    const { fields, byId, byApiName } = await loadFieldMaps(tx, layout.objectDefId);
    // Layout configs can contain stale or partial JSON. Normalize first so
    // dependency extraction operates on the same shape the builder/runtime use.
    const config = normalizeRecordPageLayoutConfig(
        layout.config as any,
        fields.map((field) => ({
            id: field.id,
            required: field.required,
            type: field.type,
        }))
    );

    const dependencies: DependencyInput[] = [
        {
            objectDefId: layout.objectDefId,
            referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
            sourcePath: "objectDefId",
        },
    ];

    (config.highlights?.fields || []).forEach((fieldId, index) => {
        dependencies.push({
            fieldDefId: fieldId,
            referenceKind: MetadataDependencyReferenceKind.HIGHLIGHT_FIELD,
            sourcePath: `highlights.fields[${index}]`,
        });
    });

    config.sections.forEach((section, sectionIndex) => {
        section.items.forEach((item, itemIndex) => {
            dependencies.push({
                fieldDefId: item.fieldId,
                referenceKind: MetadataDependencyReferenceKind.LAYOUT_FIELD,
                sourcePath: `sections[${sectionIndex}].items[${itemIndex}]`,
            });

            const filters = Array.isArray(item.visibility?.filters) ? item.visibility.filters : [];
            filters.forEach((filter, filterIndex) => {
                const fieldDefId = resolveFieldId(filter, byId, byApiName);
                if (!fieldDefId) return;
                dependencies.push({
                    fieldDefId,
                    referenceKind: MetadataDependencyReferenceKind.VISIBILITY_FIELD,
                    sourcePath: `sections[${sectionIndex}].items[${itemIndex}].visibility.filters[${filterIndex}]`,
                });
            });
        });

        const sectionFilters = Array.isArray(section.visibility?.filters) ? section.visibility.filters : [];
        sectionFilters.forEach((filter, filterIndex) => {
            const fieldDefId = resolveFieldId(filter, byId, byApiName);
            if (!fieldDefId) return;
            dependencies.push({
                fieldDefId,
                referenceKind: MetadataDependencyReferenceKind.VISIBILITY_FIELD,
                sourcePath: `sections[${sectionIndex}].visibility.filters[${filterIndex}]`,
            });
        });
    });

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.RECORD_PAGE_LAYOUT,
        sourceId: layout.id,
        sourceLabel: layout.name,
        sourceObjectDefId: layout.objectDefId,
        dependencies,
    });
}

export async function syncAppDependencies(tx: DbLike, appId: number, organizationId: number) {
    const app = await tx.appDefinition.findFirst({
        where: { id: appId, organizationId },
        include: {
            navItems: {
                orderBy: { sortOrder: "asc" },
            },
        },
    });

    if (!app) {
        await removeDependenciesForSource(tx, organizationId, MetadataDependencySourceType.APP, appId);
        return;
    }

    const dependencies: DependencyInput[] = app.navItems.map((item, index) => ({
        objectDefId: item.objectDefId,
        referenceKind: MetadataDependencyReferenceKind.NAV_OBJECT,
        sourcePath: `navItems[${index}]`,
    }));

    await replaceDependenciesForSource(tx, {
        organizationId,
        sourceType: MetadataDependencySourceType.APP,
        sourceId: app.id,
        sourceLabel: app.name,
        sourceAppId: app.id,
        dependencies,
    });
}

export async function rebuildMetadataDependenciesForOrganization(organizationId: number) {
    // Rebuilds are intentionally brute-force. They are admin-only repair logic,
    // so correctness matters more than trying to diff old dependency rows.
    await db.metadataDependency.deleteMany({
        where: { organizationId },
    });

    const fieldIds = await db.fieldDefinition.findMany({
        where: { objectDef: { organizationId } },
        select: { id: true },
    });
    for (const field of fieldIds) {
        await syncFieldDefinitionDependencies(db, field.id, organizationId);
    }

    const assignmentRuleIds = await db.assignmentRule.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const rule of assignmentRuleIds) {
        await syncAssignmentRuleDependencies(db, rule.id, organizationId);
    }

    const sharingRuleIds = await db.sharingRule.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const rule of sharingRuleIds) {
        await syncSharingRuleDependencies(db, rule.id, organizationId);
    }

    const duplicateRuleIds = await db.duplicateRule.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const rule of duplicateRuleIds) {
        await syncDuplicateRuleDependencies(db, rule.id, organizationId);
    }

    const validationRuleIds = await db.validationRule.findMany({
        where: { objectDef: { organizationId } },
        select: { id: true },
    });
    for (const rule of validationRuleIds) {
        await syncValidationRuleDependencies(db, rule.id, organizationId);
    }

    const listViewIds = await db.listView.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const listView of listViewIds) {
        await syncListViewDependencies(db, listView.id, organizationId);
    }

    const widgetIds = await db.dashboardWidget.findMany({
        where: { app: { organizationId } },
        select: { id: true },
    });
    for (const widget of widgetIds) {
        await syncDashboardWidgetDependencies(db, widget.id, organizationId);
    }

    const layoutIds = await db.recordPageLayout.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const layout of layoutIds) {
        await syncRecordPageLayoutDependencies(db, layout.id, organizationId);
    }

    const appIds = await db.appDefinition.findMany({
        where: { organizationId },
        select: { id: true },
    });
    for (const app of appIds) {
        await syncAppDependencies(db, app.id, organizationId);
    }
}
