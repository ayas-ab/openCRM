import { FieldDefinition, ObjectDefinition, OwnerType, PicklistOption, Record } from "@prisma/client";

const baseDate = new Date("2024-01-01T00:00:00.000Z");

export function makeFieldDefinition(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
    return {
        id: 1,
        objectDefId: 1,
        apiName: "field",
        label: "Field",
        type: "Text",
        required: false,
        isExternalId: false,
        isUnique: false,
        options: null,
        lookupTargetId: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        ...overrides,
    };
}

export function makeObjectDefinition(overrides: Partial<ObjectDefinition> = {}): ObjectDefinition {
    return {
        id: 1,
        apiName: "object",
        label: "Object",
        pluralLabel: "Objects",
        icon: null,
        description: null,
        isSystem: false,
        organizationId: 1,
        createdAt: baseDate,
        updatedAt: baseDate,
        notifyOnAssignment: false,
        enableChatter: false,
        ...overrides,
    };
}

export function makeRecord(overrides: Partial<Record> = {}): Record {
    return {
        id: 1,
        name: "Record",
        organizationId: 1,
        objectDefId: 1,
        ownerId: 1,
        ownerType: OwnerType.USER,
        ownerQueueId: null,
        backingUserId: null,
        createdById: 1,
        lastModifiedById: 1,
        createdAt: baseDate,
        updatedAt: baseDate,
        ...overrides,
    };
}

export function makePicklistOption(overrides: Partial<PicklistOption> = {}): PicklistOption {
    return {
        id: 1,
        organizationId: 1,
        fieldDefId: 1,
        apiName: "option",
        label: "Option",
        sortOrder: 0,
        isActive: true,
        createdAt: baseDate,
        updatedAt: baseDate,
        ...overrides,
    };
}
