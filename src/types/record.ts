import { Record as PrismaRecord, FieldDefinition } from "@prisma/client";

export type RecordField = string | number | boolean | Date | null;

export interface RecordWithData extends PrismaRecord {
    [key: string]: any; // Allow dynamic field access
}

export interface FieldDefinitionWithRelations extends FieldDefinition {
    // Add any relations if needed in the future
}
