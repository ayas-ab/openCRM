import { Prisma } from "@prisma/client";

export type AutoNumberConfig = {
    prefix: string;
    minDigits: number;
    nextValue: number;
};

type AutoNumberOptions = {
    autoNumber?: AutoNumberConfig;
};

export function parseAutoNumberOptions(options: unknown): AutoNumberOptions {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
        return {};
    }
    return options as AutoNumberOptions;
}

export function buildAutoNumberValue(config: AutoNumberConfig) {
    const prefix = config.prefix ?? "";
    const minDigits = Number.isFinite(config.minDigits) ? Math.max(0, Math.floor(config.minDigits)) : 0;
    const number = Number.isFinite(config.nextValue) ? config.nextValue : 1;
    const padded = minDigits > 0 ? String(number).padStart(minDigits, "0") : String(number);
    return `${prefix}${padded}`;
}

export async function nextAutoNumberValue(
    tx: Prisma.TransactionClient,
    fieldDefId: number
) {
    const rows = await tx.$queryRaw<{ id: number; options: Prisma.JsonValue | null }[]>(
        Prisma.sql`SELECT id, options FROM "FieldDefinition" WHERE id = ${fieldDefId} FOR UPDATE`
    );

    if (!rows.length) {
        throw new Error("AutoNumber field configuration not found.");
    }

    const options = parseAutoNumberOptions(rows[0].options);
    const config = options.autoNumber;
    if (!config) {
        throw new Error("AutoNumber settings are missing.");
    }

    const nextValue = Number.isFinite(config.nextValue) ? config.nextValue : 1;
    const safeConfig: AutoNumberConfig = {
        prefix: config.prefix ?? "",
        minDigits: Number.isFinite(config.minDigits) ? Math.max(0, Math.floor(config.minDigits)) : 0,
        nextValue,
    };

    const value = buildAutoNumberValue(safeConfig);
    const updatedOptions: AutoNumberOptions = {
        ...options,
        autoNumber: {
            ...safeConfig,
            nextValue: nextValue + 1,
        },
    };

    await tx.fieldDefinition.update({
        where: { id: fieldDefId },
        data: { options: updatedOptions as Prisma.InputJsonValue },
    });

    return value;
}
