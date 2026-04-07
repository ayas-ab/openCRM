import { describe, expect, it } from "vitest";
import {
    filterObjectDeleteBlockingDependencies,
    type MetadataDependencyDetail,
} from "@/lib/metadata-dependencies";
import {
    MetadataDependencyReferenceKind,
    MetadataDependencySourceType,
} from "@prisma/client";

function dependency(overrides: Partial<MetadataDependencyDetail>): MetadataDependencyDetail {
    return {
        id: overrides.id ?? 1,
        sourceType: overrides.sourceType ?? MetadataDependencySourceType.APP,
        sourceId: overrides.sourceId ?? 1,
        sourceLabel: overrides.sourceLabel ?? "Source",
        sourcePath: overrides.sourcePath ?? null,
        sourceObjectDefId: overrides.sourceObjectDefId ?? null,
        sourceAppId: overrides.sourceAppId ?? null,
        objectDefId: overrides.objectDefId ?? null,
        fieldDefId: overrides.fieldDefId ?? null,
        referenceKind: overrides.referenceKind ?? MetadataDependencyReferenceKind.TRIGGER_OBJECT,
        isBlockingDelete: overrides.isBlockingDelete ?? true,
        editUrl: overrides.editUrl ?? null,
        referencedObjectLabel: overrides.referencedObjectLabel ?? null,
        referencedFieldLabel: overrides.referencedFieldLabel ?? null,
        referencedFieldApiName: overrides.referencedFieldApiName ?? null,
    };
}

describe("filterObjectDeleteBlockingDependencies", () => {
    it("ignores metadata owned by the object being deleted", () => {
        const objectDefId = 42;
        const result = filterObjectDeleteBlockingDependencies(
            [
                dependency({
                    id: 1,
                    sourceType: MetadataDependencySourceType.LIST_VIEW,
                    sourceObjectDefId: objectDefId,
                    fieldDefId: 100,
                    referenceKind: MetadataDependencyReferenceKind.COLUMN_FIELD,
                }),
                dependency({
                    id: 2,
                    sourceType: MetadataDependencySourceType.VALIDATION_RULE,
                    sourceObjectDefId: objectDefId,
                    fieldDefId: 101,
                    referenceKind: MetadataDependencyReferenceKind.CONDITION_FIELD,
                }),
            ],
            objectDefId
        );

        expect(result).toEqual([]);
    });

    it("keeps external references that must block delete", () => {
        const objectDefId = 42;
        const result = filterObjectDeleteBlockingDependencies(
            [
                dependency({
                    id: 1,
                    sourceType: MetadataDependencySourceType.FIELD_DEFINITION,
                    sourceObjectDefId: 7,
                    objectDefId,
                    referenceKind: MetadataDependencyReferenceKind.LOOKUP_TARGET_OBJECT,
                }),
                dependency({
                    id: 2,
                    sourceType: MetadataDependencySourceType.APP,
                    sourceAppId: 3,
                    objectDefId,
                    referenceKind: MetadataDependencyReferenceKind.NAV_OBJECT,
                }),
                dependency({
                    id: 3,
                    sourceType: MetadataDependencySourceType.DASHBOARD_WIDGET,
                    sourceObjectDefId: 9,
                    objectDefId,
                    referenceKind: MetadataDependencyReferenceKind.TRIGGER_OBJECT,
                }),
            ],
            objectDefId
        );

        expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
    });
});
