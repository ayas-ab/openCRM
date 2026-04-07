import { getBoss } from "@/lib/jobs/pgboss";

export const SHARING_RULE_RECOMPUTE_JOB = "sharing-rule.recompute";

export type SharingRuleRecomputePayload = {
    organizationId: number;
    objectDefId: number;
};

export async function enqueueSharingRuleRecompute(payload: SharingRuleRecomputePayload) {
    const boss = await getBoss();
    await boss.createQueue(SHARING_RULE_RECOMPUTE_JOB);
    const singletonKey = `${payload.organizationId}:${payload.objectDefId}`;
    await boss.send(SHARING_RULE_RECOMPUTE_JOB, payload, { singletonKey });
}
