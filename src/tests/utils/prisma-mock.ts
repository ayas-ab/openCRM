import { vi } from "vitest";

export const mockDb = {
    permissionSetAssignment: {
        findMany: vi.fn(),
    },
    objectPermission: {
        findMany: vi.fn(),
    },
    objectDefinition: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
    appPermission: {
        findMany: vi.fn(),
    },
    permissionSet: {
        findFirst: vi.fn(),
    },
    queueMember: {
        findMany: vi.fn(),
    },
} as const;

export function resetMockDb() {
    Object.values(mockDb).forEach((group) => {
        Object.values(group).forEach((fn) => {
            if (typeof fn === "function" && "mockReset" in fn) {
                (fn as ReturnType<typeof vi.fn>).mockReset();
            }
        });
    });
}
