import PgBoss from "pg-boss";
import { recomputeSharingRulesForObject } from "../lib/sharing-rule-recompute";
import { SHARING_RULE_RECOMPUTE_JOB, SharingRuleRecomputePayload } from "../lib/jobs/sharing-rule-jobs";
import { IMPORT_PROCESS_JOB, ImportProcessPayload } from "../lib/jobs/import-jobs";
import { processImportJob } from "../lib/import-processing";

async function startWorker() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }

    const boss = new PgBoss({ connectionString, schema: "pgboss" });
    boss.on("error", (error) => {
        console.error("pg-boss worker error:", error);
    });

    await boss.start();

    await boss.createQueue(SHARING_RULE_RECOMPUTE_JOB);
    await boss.createQueue(IMPORT_PROCESS_JOB);

    await boss.work<SharingRuleRecomputePayload>(SHARING_RULE_RECOMPUTE_JOB, async (jobs) => {
        for (const job of jobs) {
            const payload = job?.data ?? null;
            if (!payload?.organizationId || !payload?.objectDefId) {
                console.warn("Skipping sharing-rule.recompute job with missing payload", {
                    jobId: job?.id,
                    data: job?.data,
                });
                continue;
            }

            await recomputeSharingRulesForObject({
                organizationId: payload.organizationId,
                objectDefId: payload.objectDefId,
            });
        }
    });

    await boss.work<ImportProcessPayload>(IMPORT_PROCESS_JOB, async (jobs) => {
        for (const job of jobs) {
            const payload = job?.data ?? null;
            if (!payload?.jobId) {
                console.warn("Skipping import.process job with missing payload", {
                    jobId: job?.id,
                    data: job?.data,
                });
                continue;
            }
            await processImportJob(payload.jobId);
        }
    });

    const shutdown = async () => {
        await boss.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

startWorker().catch((error) => {
    console.error("Failed to start sharing rule worker:", error);
    process.exit(1);
});
