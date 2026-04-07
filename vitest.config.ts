import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "src") };
const shared = {
    plugins: [react()],
    resolve: { alias },
};

export default defineConfig({
    ...shared,
    test: {
        projects: [
            {
                ...shared,
                test: {
                    name: "unit",
                    environment: "node",
                    setupFiles: ["src/tests/setup.ts"],
                    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
                },
            },
        ],
        coverage: {
            provider: "v8",
            thresholds: {
                lines: 65,
                branches: 60,
                functions: 65,
                statements: 65,
            },
            exclude: [
                "**/docs/**",
                "**/public/**",
                "**/src/app/**",
                "**/src/components/ui/**",
                "**/src/jobs/**",
            ],
        },
    },
});
