import { getBoss } from "@/lib/jobs/pgboss";

export const IMPORT_PROCESS_JOB = "import.process";

export type ImportProcessPayload = {
    jobId: number;
    organizationId: number;
};

export async function enqueueImportJob(payload: ImportProcessPayload) {
    const boss = await getBoss();
    await boss.createQueue(IMPORT_PROCESS_JOB);
    await boss.send(IMPORT_PROCESS_JOB, payload);
}
