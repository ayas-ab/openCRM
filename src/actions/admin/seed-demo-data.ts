"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { buildFieldDataPayload, deriveRecordName } from "@/lib/field-data";
import { buildDefaultLayoutConfig } from "@/lib/record-page-layout";
import { normalizePicklistApiName } from "@/lib/api-names";
import { rebuildMetadataDependenciesForOrganization } from "@/lib/metadata-dependencies";
import { recomputeSharingRulesForObject } from "@/lib/sharing-rule-recompute";
import {
    AssignmentTargetType,
    OwnerType,
    ShareAccessLevel,
    UserType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureUserCompanionRecord } from "@/lib/user-companion";

export async function seedDemoData() {
    const session = await auth();

    if (!session?.user || (session.user as any).userType !== "admin") {
        return { success: false, error: "Unauthorized" };
    }

    const organizationId = parseInt((session.user as any).organizationId);
    const adminUserId = parseInt((session.user as any).id);
    const adminEmail = session.user.email ?? "admin@example.com";
    const adminUsernameRaw = ((session.user as any).username ?? "admin").toString();

    const [emailLocalRaw, emailDomainRaw] = adminEmail.split("@");
    const emailLocal = emailLocalRaw || "admin";
    const emailDomain = emailDomainRaw || "example.com";
    const baseUsernameRaw = adminUsernameRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
    const baseUsername = baseUsernameRaw.length > 0 ? `${baseUsernameRaw}${organizationId}` : `user${organizationId}`;
    const sharingRuleObjectIds = new Set<number>();

    try {
        await db.organization.updateMany({
            where: { id: organizationId, ownerId: null },
            data: { ownerId: adminUserId },
        });

        const existing = await db.appDefinition.findFirst({
            where: {
                organizationId,
                name: { in: ["Jira", "Healthcare"] } as any,
            },
        });

        if (existing) {
            return { success: false, error: "Demo data already exists for this org." };
        }

        const hashedPassword = await bcrypt.hash("123123", 10);

        const buildUserIdentity = (index: number) => {
            const suffix = `user${index}`;
            return {
                email: `${emailLocal}.${suffix}@${emailDomain}`,
                username: `${baseUsername}${suffix}`,
            };
        };

        await db.$transaction(async (tx) => {
            // Groups
            const adminGroup = await tx.group.create({
                data: {
                    organizationId,
                    name: "Admin Group",
                    description: "Administrators across all apps.",
                },
            });
            const jiraGroup = await tx.group.create({
                data: {
                    organizationId,
                    name: "Jira Team",
                    description: "Delivery team for Jira projects and issues.",
                },
            });
            const healthGroup = await tx.group.create({
                data: {
                    organizationId,
                    name: "Healthcare Team",
                    description: "Clinical staff with shared access to patient records.",
                },
            });

            await tx.user.update({
                where: { id: adminUserId },
                data: { groupId: adminGroup.id },
            });

            // Queues
            const jiraQueue = await tx.queue.create({
                data: {
                    organizationId,
                    name: "Jira Triage",
                    description: "Critical issues awaiting assignment.",
                },
            });
            const healthQueue = await tx.queue.create({
                data: {
                    organizationId,
                    name: "Health Intake",
                    description: "Incoming appointments to be routed.",
                },
            });

            // Users
            const jiraLeadIdentity = buildUserIdentity(2);
            const jiraDevIdentity = buildUserIdentity(3);
            const jiraQaIdentity = buildUserIdentity(4);
            const clinicManagerIdentity = buildUserIdentity(5);
            const nurseIdentity = buildUserIdentity(6);

            const jiraLead = await tx.user.create({
                data: {
                    organizationId,
                    name: "Jira Lead",
                    username: jiraLeadIdentity.username,
                    email: jiraLeadIdentity.email,
                    password: hashedPassword,
                    userType: UserType.standard,
                    groupId: jiraGroup.id,
                },
            });
            const jiraDev = await tx.user.create({
                data: {
                    organizationId,
                    name: "Jira Developer",
                    username: jiraDevIdentity.username,
                    email: jiraDevIdentity.email,
                    password: hashedPassword,
                    userType: UserType.standard,
                    groupId: jiraGroup.id,
                },
            });
            const jiraQa = await tx.user.create({
                data: {
                    organizationId,
                    name: "Jira QA",
                    username: jiraQaIdentity.username,
                    email: jiraQaIdentity.email,
                    password: hashedPassword,
                    userType: UserType.standard,
                    groupId: jiraGroup.id,
                },
            });
            const clinicManager = await tx.user.create({
                data: {
                    organizationId,
                    name: "Clinic Manager",
                    username: clinicManagerIdentity.username,
                    email: clinicManagerIdentity.email,
                    password: hashedPassword,
                    userType: UserType.standard,
                    groupId: healthGroup.id,
                },
            });
            const nurse = await tx.user.create({
                data: {
                    organizationId,
                    name: "Nurse Taylor",
                    username: nurseIdentity.username,
                    email: nurseIdentity.email,
                    password: hashedPassword,
                    userType: UserType.standard,
                    groupId: healthGroup.id,
                },
            });

            await ensureUserCompanionRecord(tx, organizationId, jiraLead.id);
            await ensureUserCompanionRecord(tx, organizationId, jiraDev.id);
            await ensureUserCompanionRecord(tx, organizationId, jiraQa.id);
            await ensureUserCompanionRecord(tx, organizationId, clinicManager.id);
            await ensureUserCompanionRecord(tx, organizationId, nurse.id);

            const jiraUsers = [jiraLead.id, jiraDev.id, jiraQa.id];
            const healthUsers = [clinicManager.id, nurse.id];

            await tx.queueMember.createMany({
                data: [
                    ...jiraUsers.map((userId) => ({ queueId: jiraQueue.id, userId })),
                    ...healthUsers.map((userId) => ({ queueId: healthQueue.id, userId })),
                ],
            });

            // Apps
            const jiraApp = await tx.appDefinition.create({
                data: {
                    organizationId,
                    name: "Jira",
                    apiName: "jira",
                    description: "Projects, epics, and issue tracking",
                    icon: "KanbanSquare",
                },
            });
            const healthcareApp = await tx.appDefinition.create({
                data: {
                    organizationId,
                    name: "Healthcare",
                    apiName: "healthcare",
                    description: "Patients, providers, and appointments",
                    icon: "HeartPulse",
                },
            });

            // Jira Objects
            const projectObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "project",
                    label: "Project",
                    pluralLabel: "Projects",
                    icon: "FolderKanban",
                    description: "Jira projects",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: projectObj.id, apiName: "name", label: "Project Name", type: "Text", required: true },
                    { objectDefId: projectObj.id, apiName: "key", label: "Project Key", type: "Text" },
                    { objectDefId: projectObj.id, apiName: "status", label: "Status", type: "Picklist" },
                    { objectDefId: projectObj.id, apiName: "start_date", label: "Start Date", type: "Date" },
                    { objectDefId: projectObj.id, apiName: "end_date", label: "Target End", type: "Date" },
                    { objectDefId: projectObj.id, apiName: "lead", label: "Project Lead", type: "Text" },
                ],
            });

            const epicObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "epic",
                    label: "Epic",
                    pluralLabel: "Epics",
                    icon: "Flag",
                    description: "Epic-level initiatives",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: epicObj.id, apiName: "name", label: "Epic Name", type: "Text", required: true },
                    { objectDefId: epicObj.id, apiName: "status", label: "Status", type: "Picklist" },
                    { objectDefId: epicObj.id, apiName: "project", label: "Project", type: "Lookup", lookupTargetId: projectObj.id },
                    { objectDefId: epicObj.id, apiName: "owner", label: "Owner", type: "Text" },
                    { objectDefId: epicObj.id, apiName: "target_date", label: "Target Date", type: "Date" },
                ],
            });

            const issueObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "issue",
                    label: "Issue",
                    pluralLabel: "Issues",
                    icon: "Bug",
                    description: "Stories, tasks, and bugs",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: issueObj.id, apiName: "name", label: "Summary", type: "Text", required: true },
                    { objectDefId: issueObj.id, apiName: "status", label: "Status", type: "Picklist" },
                    { objectDefId: issueObj.id, apiName: "priority", label: "Priority", type: "Picklist" },
                    { objectDefId: issueObj.id, apiName: "issue_type", label: "Type", type: "Picklist" },
                    { objectDefId: issueObj.id, apiName: "points", label: "Story Points", type: "Number" },
                    { objectDefId: issueObj.id, apiName: "due_date", label: "Due Date", type: "Date" },
                    { objectDefId: issueObj.id, apiName: "project", label: "Project", type: "Lookup", lookupTargetId: projectObj.id },
                    { objectDefId: issueObj.id, apiName: "epic", label: "Epic", type: "Lookup", lookupTargetId: epicObj.id },
                    { objectDefId: issueObj.id, apiName: "assignee", label: "Assignee", type: "Text" },
                    { objectDefId: issueObj.id, apiName: "reporter", label: "Reporter", type: "Text" },
                    { objectDefId: issueObj.id, apiName: "blocked", label: "Blocked", type: "Checkbox" },
                ],
            });

            // Healthcare Objects
            const providerObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "provider",
                    label: "Provider",
                    pluralLabel: "Providers",
                    icon: "Stethoscope",
                    description: "Clinicians and staff",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: providerObj.id, apiName: "name", label: "Provider Name", type: "Text", required: true },
                    { objectDefId: providerObj.id, apiName: "specialty", label: "Specialty", type: "Picklist" },
                    { objectDefId: providerObj.id, apiName: "email", label: "Email", type: "Email" },
                    { objectDefId: providerObj.id, apiName: "phone", label: "Phone", type: "Phone" },
                ],
            });

            const patientObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "patient",
                    label: "Patient",
                    pluralLabel: "Patients",
                    icon: "UserRound",
                    description: "Patient records",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: patientObj.id, apiName: "name", label: "Full Name", type: "Text", required: true },
                    { objectDefId: patientObj.id, apiName: "email", label: "Email", type: "Email" },
                    { objectDefId: patientObj.id, apiName: "phone", label: "Phone", type: "Phone" },
                    { objectDefId: patientObj.id, apiName: "dob", label: "Date of Birth", type: "Date" },
                    { objectDefId: patientObj.id, apiName: "insurance", label: "Insurance", type: "Picklist" },
                    { objectDefId: patientObj.id, apiName: "status", label: "Status", type: "Picklist" },
                    { objectDefId: patientObj.id, apiName: "high_risk", label: "High Risk", type: "Checkbox" },
                ],
            });

            const appointmentObj = await tx.objectDefinition.create({
                data: {
                    organizationId,
                    apiName: "appointment",
                    label: "Appointment",
                    pluralLabel: "Appointments",
                    icon: "CalendarClock",
                    description: "Visits and consultations",
                },
            });
            await tx.fieldDefinition.createMany({
                data: [
                    { objectDefId: appointmentObj.id, apiName: "name", label: "Visit Title", type: "Text", required: true },
                    { objectDefId: appointmentObj.id, apiName: "date", label: "Date", type: "Date" },
                    { objectDefId: appointmentObj.id, apiName: "status", label: "Status", type: "Picklist" },
                    { objectDefId: appointmentObj.id, apiName: "patient", label: "Patient", type: "Lookup", lookupTargetId: patientObj.id },
                    { objectDefId: appointmentObj.id, apiName: "provider", label: "Provider", type: "Lookup", lookupTargetId: providerObj.id },
                    { objectDefId: appointmentObj.id, apiName: "reason", label: "Reason", type: "Text" },
                    { objectDefId: appointmentObj.id, apiName: "follow_up", label: "Follow Up Needed", type: "Checkbox" },
                ],
            });

            const createPicklistOptions = async (fieldDefId: number | undefined, labels: string[]) => {
                if (!fieldDefId || labels.length === 0) return;
                await tx.picklistOption.createMany({
                    data: labels.map((label, index) => ({
                        organizationId,
                        fieldDefId,
                        apiName: normalizePicklistApiName(label),
                        label,
                        sortOrder: index,
                        isActive: true,
                    })),
                });
            };

            const createRecordPageLayout = async (
                objectDef: { id: number; label: string },
                highlightApiNames: string[]
            ) => {
                const fields = await tx.fieldDefinition.findMany({
                    where: { objectDefId: objectDef.id },
                    select: { id: true, apiName: true, required: true },
                });
                const fieldByApi = new Map(fields.map((field) => [field.apiName, field.id]));
                const config = buildDefaultLayoutConfig(fields);
                const highlightIds = highlightApiNames
                    .map((apiName) => fieldByApi.get(apiName))
                    .filter((id): id is number => Boolean(id));

                config.highlights = {
                    columns: 4,
                    fields: highlightIds.slice(0, 4),
                };

                return tx.recordPageLayout.create({
                    data: {
                        organizationId,
                        objectDefId: objectDef.id,
                        name: `${objectDef.label} Layout`,
                        isDefault: true,
                        config,
                    },
                });
            };

            const createRecordPageAssignment = async (
                objectDefId: number,
                appId: number,
                layoutId: number
            ) =>
                tx.recordPageAssignment.create({
                    data: {
                        organizationId,
                        objectDefId,
                        appId,
                        layoutId,
                    },
                });

            const createDefaultListView = async (
                objectDefId: number,
                pluralLabel: string,
                columnApiNames: string[]
            ) => {
                const fields = await tx.fieldDefinition.findMany({
                    where: { objectDefId },
                    select: { id: true, apiName: true },
                });
                const fieldByApi = new Map(fields.map((field) => [field.apiName, field.id]));
                const columns = columnApiNames
                    .map((apiName) => fieldByApi.get(apiName))
                    .filter((id): id is number => Boolean(id));
                if (columns.length === 0) return;

                await tx.listView.create({
                    data: {
                        organizationId,
                        objectDefId,
                        name: `All ${pluralLabel}`,
                        isDefault: true,
                        isGlobal: true,
                        criteria: {
                            logic: "ALL",
                            filters: [],
                            ownerScope: "any",
                            ownerQueueId: null,
                        },
                        columns: {
                            create: columns.map((fieldDefId, index) => ({
                                fieldDefId,
                                sortOrder: index,
                            })),
                        },
                    },
                });
            };

            const createListView = async (options: {
                objectDefId: number;
                name: string;
                columns: string[];
                criteria?: {
                    logic: "ALL" | "ANY";
                    filters: Array<{ fieldDefId: number; operator?: string; value?: string }>;
                };
                sortField?: string;
                sortDirection?: "asc" | "desc";
                isGlobal?: boolean;
                shareGroupIds?: number[];
                sharePermissionSetIds?: number[];
            }) => {
                const fields = await tx.fieldDefinition.findMany({
                    where: { objectDefId: options.objectDefId },
                    select: {
                        id: true,
                        apiName: true,
                        type: true,
                        picklistOptions: { select: { id: true, label: true, apiName: true } },
                    },
                });
                const fieldByApi = new Map(fields.map((field) => [field.apiName, field.id]));
                const fieldById = new Map(fields.map((field) => [field.id, field]));
                const columnIds = options.columns
                    .map((apiName) => fieldByApi.get(apiName))
                    .filter((id): id is number => Boolean(id));

                if (columnIds.length === 0) return;

                const shareGroupIds = options.isGlobal ? [] : options.shareGroupIds ?? [];
                const sharePermissionSetIds = options.isGlobal ? [] : options.sharePermissionSetIds ?? [];

                const shareRecords = [
                    ...shareGroupIds.map((groupId) => ({
                        principalType: "GROUP" as const,
                        principalId: groupId,
                    })),
                    ...sharePermissionSetIds.map((permissionSetId) => ({
                        principalType: "PERMISSION_SET" as const,
                        principalId: permissionSetId,
                    })),
                ];

                const filters = (options.criteria?.filters ?? []).map((filter) => {
                    const fieldId = filter.fieldDefId;
                    const fieldDef = fieldId ? fieldById.get(fieldId) : null;
                    if (fieldDef?.type === "Picklist" && filter.value) {
                        const match = fieldDef.picklistOptions?.find(
                            (option) =>
                                option.id === Number(filter.value) ||
                                option.label === filter.value ||
                                option.apiName === filter.value
                        );
                        const picklistId = match?.id;
                        return {
                            ...filter,
                            fieldDefId: fieldId,
                            value: picklistId ? String(picklistId) : filter.value,
                        };
                    }
                    return filter;
                });

                await tx.listView.create({
                    data: {
                        organizationId,
                        objectDefId: options.objectDefId,
                        name: options.name,
                        criteria: options.criteria
                            ? { ...options.criteria, filters, ownerScope: "any", ownerQueueId: null }
                            : { logic: "ALL", filters: [], ownerScope: "any", ownerQueueId: null },
                        sortField: options.sortField ?? null,
                        sortDirection: options.sortDirection ?? "asc",
                        isDefault: false,
                        isGlobal: options.isGlobal ?? false,
                        columns: {
                            create: columnIds.map((fieldDefId, index) => ({
                                fieldDefId,
                                sortOrder: index,
                            })),
                        },
                        shares: shareRecords.length
                            ? {
                                create: shareRecords.map((share) => ({
                                    ...share,
                                    organizationId,
                                })),
                            }
                            : undefined,
                    },
                });
            };

            await createDefaultListView(projectObj.id, projectObj.pluralLabel, ["name", "key", "status", "lead"]);
            await createDefaultListView(epicObj.id, epicObj.pluralLabel, ["name", "status", "project", "owner"]);
            await createDefaultListView(issueObj.id, issueObj.pluralLabel, ["name", "status", "priority", "assignee"]);
            await createDefaultListView(providerObj.id, providerObj.pluralLabel, ["name", "specialty", "email"]);
            await createDefaultListView(patientObj.id, patientObj.pluralLabel, ["name", "status", "insurance", "phone"]);
            await createDefaultListView(appointmentObj.id, appointmentObj.pluralLabel, ["name", "date", "status", "patient"]);

            const projectFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: projectObj.id },
                select: { id: true, apiName: true, type: true },
            });
            const epicFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: epicObj.id },
                select: { id: true, apiName: true, type: true },
            });
            const issueFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: issueObj.id },
                select: { id: true, apiName: true, type: true },
            });
            const patientFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: patientObj.id },
                select: { id: true, apiName: true, type: true },
            });
            const appointmentFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: appointmentObj.id },
                select: { id: true, apiName: true, type: true },
            });
            const providerFields = await tx.fieldDefinition.findMany({
                where: { objectDefId: providerObj.id },
                select: { id: true, apiName: true, type: true },
            });

            const mapFields = (fields: { id: number; apiName: string }[]) =>
                new Map(fields.map((field) => [field.apiName, field.id]));

            const projectFieldMap = mapFields(projectFields);
            const epicFieldMap = mapFields(epicFields);
            const issueFieldMap = mapFields(issueFields);
            const patientFieldMap = mapFields(patientFields);
            const appointmentFieldMap = mapFields(appointmentFields);
            const providerFieldMap = mapFields(providerFields);

            await createPicklistOptions(projectFieldMap.get("status"), ["Active", "On Hold", "Archived"]);
            await createPicklistOptions(epicFieldMap.get("status"), ["Planned", "In Progress", "Done"]);
            await createPicklistOptions(issueFieldMap.get("status"), ["To Do", "In Progress", "In Review", "Done"]);
            await createPicklistOptions(issueFieldMap.get("priority"), ["Low", "Medium", "High", "Critical"]);
            await createPicklistOptions(issueFieldMap.get("issue_type"), ["Bug", "Story", "Task"]);
            await createPicklistOptions(providerFieldMap.get("specialty"), ["Primary Care", "Cardiology", "Pediatrics", "Orthopedics"]);
            await createPicklistOptions(patientFieldMap.get("insurance"), ["Medicare", "Private", "Self-Pay"]);
            await createPicklistOptions(patientFieldMap.get("status"), ["Active", "Inactive"]);
            await createPicklistOptions(appointmentFieldMap.get("status"), ["Scheduled", "Checked In", "Completed", "Canceled"]);

            const picklistOptions = await tx.picklistOption.findMany({
                where: { organizationId },
                select: { id: true, label: true, apiName: true, fieldDefId: true },
            });
            const picklistOptionLookup = new Map<number, Map<string, number>>();
            for (const option of picklistOptions) {
                if (!picklistOptionLookup.has(option.fieldDefId)) {
                    picklistOptionLookup.set(option.fieldDefId, new Map());
                }
                const lookup = picklistOptionLookup.get(option.fieldDefId)!;
                lookup.set(String(option.id), option.id);
                lookup.set(option.label, option.id);
                lookup.set(option.apiName, option.id);
            }

            const resolvePicklistOptionId = (fieldDefId: number | undefined, value: any) => {
                if (!fieldDefId || value === undefined || value === null || value === "") return null;
                const lookup = picklistOptionLookup.get(fieldDefId);
                if (!lookup) return null;
                return lookup.get(String(value)) ?? null;
            };

            const requirePicklistOptionId = (fieldDefId: number | undefined, value: any) => {
                const resolved = resolvePicklistOptionId(fieldDefId, value);
                if (!resolved) {
                    throw new Error(`Picklist option not found for field ${fieldDefId}: ${value}`);
                }
                return resolved;
            };

            const resolvePicklistCriteriaValue = (fieldDefId: number | undefined, value: any) => {
                const picklistId = resolvePicklistOptionId(fieldDefId, value);
                return picklistId ? String(picklistId) : value;
            };

            await createListView({
                objectDefId: projectObj.id,
                name: "Active Projects",
                columns: ["name", "status", "lead", "end_date"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: projectFieldMap.get("status") ?? 0,
                            operator: "equals",
                            value: "Active",
                        },
                    ],
                },
                sortField: "end_date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [jiraGroup.id],
            });

            await createListView({
                objectDefId: epicObj.id,
                name: "Epics In Progress",
                columns: ["name", "status", "project", "owner"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: epicFieldMap.get("status") ?? 0,
                            operator: "equals",
                            value: "In Progress",
                        },
                    ],
                },
                sortField: "target_date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [jiraGroup.id],
            });

            await createListView({
                objectDefId: issueObj.id,
                name: "Critical Issues",
                columns: ["name", "priority", "status", "assignee"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: issueFieldMap.get("priority") ?? 0,
                            operator: "equals",
                            value: "Critical",
                        },
                    ],
                },
                sortField: "due_date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [jiraGroup.id],
            });

            await createListView({
                objectDefId: issueObj.id,
                name: "In Review Issues",
                columns: ["name", "status", "priority", "reporter"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: issueFieldMap.get("status") ?? 0,
                            operator: "equals",
                            value: "In Review",
                        },
                    ],
                },
                sortField: "due_date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [jiraGroup.id],
            });

            await createListView({
                objectDefId: issueObj.id,
                name: "Bug Backlog",
                columns: ["name", "issue_type", "priority", "assignee"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: issueFieldMap.get("issue_type") ?? 0,
                            operator: "equals",
                            value: "Bug",
                        },
                    ],
                },
                sortField: "priority",
                sortDirection: "desc",
                isGlobal: false,
                shareGroupIds: [jiraGroup.id],
            });

            await createListView({
                objectDefId: patientObj.id,
                name: "Active Patients",
                columns: ["name", "status", "insurance", "phone"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: patientFieldMap.get("status") ?? 0,
                            operator: "equals",
                            value: "Active",
                        },
                    ],
                },
                sortField: "name",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [healthGroup.id],
            });

            await createListView({
                objectDefId: patientObj.id,
                name: "Medicare Patients",
                columns: ["name", "insurance", "status", "phone"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: patientFieldMap.get("insurance") ?? 0,
                            operator: "equals",
                            value: "Medicare",
                        },
                    ],
                },
                sortField: "name",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [healthGroup.id],
            });

            await createListView({
                objectDefId: appointmentObj.id,
                name: "Scheduled Visits",
                columns: ["name", "date", "patient", "provider"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: appointmentFieldMap.get("status") ?? 0,
                            operator: "equals",
                            value: "Scheduled",
                        },
                    ],
                },
                sortField: "date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [healthGroup.id],
            });

            await createListView({
                objectDefId: appointmentObj.id,
                name: "Follow-up Needed",
                columns: ["name", "date", "patient", "follow_up"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: appointmentFieldMap.get("follow_up") ?? 0,
                            operator: "equals",
                            value: "true",
                        },
                    ],
                },
                sortField: "date",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [healthGroup.id],
            });

            await createListView({
                objectDefId: providerObj.id,
                name: "Cardiology Providers",
                columns: ["name", "specialty", "email"],
                criteria: {
                    logic: "ALL",
                    filters: [
                        {
                            fieldDefId: providerFieldMap.get("specialty") ?? 0,
                            operator: "equals",
                            value: "Cardiology",
                        },
                    ],
                },
                sortField: "name",
                sortDirection: "asc",
                isGlobal: false,
                shareGroupIds: [healthGroup.id],
            });

            const projectLayout = await createRecordPageLayout(projectObj, ["status", "lead", "start_date", "end_date"]);
            const epicLayout = await createRecordPageLayout(epicObj, ["status", "project", "owner", "target_date"]);
            const issueLayout = await createRecordPageLayout(issueObj, ["status", "priority", "issue_type", "assignee"]);
            const patientLayout = await createRecordPageLayout(patientObj, ["status", "insurance", "high_risk", "phone"]);
            const appointmentLayout = await createRecordPageLayout(appointmentObj, ["status", "date", "patient", "provider"]);
            const providerLayout = await createRecordPageLayout(providerObj, ["specialty", "email", "phone"]);

            await createRecordPageAssignment(projectObj.id, jiraApp.id, projectLayout.id);
            await createRecordPageAssignment(epicObj.id, jiraApp.id, epicLayout.id);
            await createRecordPageAssignment(issueObj.id, jiraApp.id, issueLayout.id);

            await createRecordPageAssignment(patientObj.id, healthcareApp.id, patientLayout.id);
            await createRecordPageAssignment(appointmentObj.id, healthcareApp.id, appointmentLayout.id);
            await createRecordPageAssignment(providerObj.id, healthcareApp.id, providerLayout.id);

            await tx.dashboardWidget.createMany({
                data: [
                    {
                        appId: jiraApp.id,
                        objectDefId: issueObj.id,
                        type: "metric",
                        title: "In Progress Issues",
                        sortOrder: 0,
                        layout: { colSpan: 3 },
                        config: {
                            objectDefId: issueObj.id,
                            aggregation: "count",
                            filters: [
                                {
                                    id: "issue-status-in-progress",
                                    fieldDefId: issueFieldMap.get("status") ?? 0,
                                    operator: "equals",
                                    value: String(requirePicklistOptionId(issueFieldMap.get("status"), "In Progress")),
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "ocean",
                            icon: "Gauge",
                            color: "#2563eb",
                        },
                    },
                    {
                        appId: jiraApp.id,
                        objectDefId: issueObj.id,
                        type: "metric",
                        title: "Critical Issues",
                        sortOrder: 1,
                        layout: { colSpan: 3 },
                        config: {
                            objectDefId: issueObj.id,
                            aggregation: "count",
                            filters: [
                                {
                                    id: "issue-priority-critical",
                                    fieldDefId: issueFieldMap.get("priority") ?? 0,
                                    operator: "equals",
                                    value: String(requirePicklistOptionId(issueFieldMap.get("priority"), "Critical")),
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "sunset",
                            icon: "AlertTriangle",
                            color: "#f97316",
                        },
                    },
                    {
                        appId: jiraApp.id,
                        objectDefId: issueObj.id,
                        type: "list",
                        title: "Latest Issues",
                        sortOrder: 2,
                        layout: { colSpan: 6 },
                        config: {
                            objectDefId: issueObj.id,
                            limit: 6,
                            fieldDefIds: [
                                issueFieldMap.get("priority") ?? 0,
                                issueFieldMap.get("status") ?? 0,
                            ].filter((id) => id > 0),
                            systemFields: ["updatedAt"],
                            sortSystemField: "updatedAt",
                            sortDirection: "desc",
                            filterLogic: "ALL",
                            colorTheme: "slate",
                            icon: "ListTodo",
                            color: "#475569",
                        },
                    },
                    {
                        appId: jiraApp.id,
                        objectDefId: projectObj.id,
                        type: "list",
                        title: "Projects Near Target",
                        sortOrder: 3,
                        layout: { colSpan: 6 },
                        config: {
                            objectDefId: projectObj.id,
                            limit: 6,
                            fieldDefIds: [
                                projectFieldMap.get("status") ?? 0,
                                projectFieldMap.get("end_date") ?? 0,
                            ].filter((id) => id > 0),
                            sortFieldDefId: projectFieldMap.get("end_date") ?? 0,
                            sortDirection: "asc",
                            filterLogic: "ALL",
                            colorTheme: "indigo",
                            icon: "FolderKanban",
                            color: "#4f46e5",
                        },
                    },
                    {
                        appId: healthcareApp.id,
                        objectDefId: patientObj.id,
                        type: "metric",
                        title: "Active Patients",
                        sortOrder: 0,
                        layout: { colSpan: 3 },
                        config: {
                            objectDefId: patientObj.id,
                            aggregation: "count",
                            filters: [
                                {
                                    id: "patient-status-active",
                                    fieldDefId: patientFieldMap.get("status") ?? 0,
                                    operator: "equals",
                                    value: String(requirePicklistOptionId(patientFieldMap.get("status"), "Active")),
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "forest",
                            icon: "Users",
                            color: "#10b981",
                        },
                    },
                    {
                        appId: healthcareApp.id,
                        objectDefId: appointmentObj.id,
                        type: "metric",
                        title: "Scheduled Visits",
                        sortOrder: 1,
                        layout: { colSpan: 3 },
                        config: {
                            objectDefId: appointmentObj.id,
                            aggregation: "count",
                            filters: [
                                {
                                    id: "appointment-status-scheduled",
                                    fieldDefId: appointmentFieldMap.get("status") ?? 0,
                                    operator: "equals",
                                    value: String(requirePicklistOptionId(appointmentFieldMap.get("status"), "Scheduled")),
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "sky",
                            icon: "CalendarClock",
                            color: "#0ea5e9",
                        },
                    },
                    {
                        appId: healthcareApp.id,
                        objectDefId: appointmentObj.id,
                        type: "list",
                        title: "Upcoming Appointments",
                        sortOrder: 2,
                        layout: { colSpan: 6 },
                        config: {
                            objectDefId: appointmentObj.id,
                            limit: 6,
                            fieldDefIds: [
                                appointmentFieldMap.get("status") ?? 0,
                                appointmentFieldMap.get("date") ?? 0,
                                appointmentFieldMap.get("patient") ?? 0,
                            ].filter((id) => id > 0),
                            sortFieldDefId: appointmentFieldMap.get("date") ?? 0,
                            sortDirection: "asc",
                            filters: [
                                {
                                    id: "appointment-status-upcoming",
                                    fieldDefId: appointmentFieldMap.get("status") ?? 0,
                                    operator: "equals",
                                    value: String(requirePicklistOptionId(appointmentFieldMap.get("status"), "Scheduled")),
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "sky",
                            icon: "CalendarDays",
                            color: "#0284c7",
                        },
                    },
                    {
                        appId: healthcareApp.id,
                        objectDefId: appointmentObj.id,
                        type: "list",
                        title: "Follow-up Needed",
                        sortOrder: 3,
                        layout: { colSpan: 6 },
                        config: {
                            objectDefId: appointmentObj.id,
                            limit: 6,
                            fieldDefIds: [
                                appointmentFieldMap.get("status") ?? 0,
                                appointmentFieldMap.get("date") ?? 0,
                                appointmentFieldMap.get("patient") ?? 0,
                            ].filter((id) => id > 0),
                            sortFieldDefId: appointmentFieldMap.get("date") ?? 0,
                            sortDirection: "asc",
                            filters: [
                                {
                                    id: "appointment-follow-up-needed",
                                    fieldDefId: appointmentFieldMap.get("follow_up") ?? 0,
                                    operator: "equals",
                                    value: "true",
                                },
                            ],
                            filterLogic: "ALL",
                            colorTheme: "amber",
                            icon: "ClipboardPlus",
                            color: "#d97706",
                        },
                    },
                ],
            });

            // App navigation
            await tx.appNavItem.createMany({
                data: [
                    { appId: jiraApp.id, objectDefId: issueObj.id, sortOrder: 0 },
                    { appId: jiraApp.id, objectDefId: projectObj.id, sortOrder: 1 },
                    { appId: jiraApp.id, objectDefId: epicObj.id, sortOrder: 2 },
                    { appId: healthcareApp.id, objectDefId: patientObj.id, sortOrder: 0 },
                    { appId: healthcareApp.id, objectDefId: appointmentObj.id, sortOrder: 1 },
                    { appId: healthcareApp.id, objectDefId: providerObj.id, sortOrder: 2 },
                ],
            });

            // Permission sets
            const orgAdminSet = await tx.permissionSet.create({
                data: {
                    organizationId,
                    name: "Org Admin",
                    description: "Full access to all demo objects",
                    allowDataLoading: true,
                },
            });
            const jiraAdminSet = await tx.permissionSet.create({
                data: {
                    organizationId,
                    name: "Jira Admin",
                    description: "Manage Jira projects and issues",
                    allowDataLoading: true,
                },
            });
            const jiraAgentSet = await tx.permissionSet.create({
                data: {
                    organizationId,
                    name: "Jira Agent",
                    description: "Work on Jira issues",
                },
            });
            const healthAdminSet = await tx.permissionSet.create({
                data: {
                    organizationId,
                    name: "Health Admin",
                    description: "Manage patient operations",
                    allowDataLoading: true,
                },
            });
            const healthStaffSet = await tx.permissionSet.create({
                data: {
                    organizationId,
                    name: "Health Staff",
                    description: "Handle appointments and patient intake",
                },
            });

            const jiraObjectIds = [projectObj.id, epicObj.id, issueObj.id];
            const healthObjectIds = [patientObj.id, appointmentObj.id, providerObj.id];
            const allObjectIds = [...jiraObjectIds, ...healthObjectIds];

            const createObjectPermissions = async (
                permissionSetId: number,
                objectIds: number[],
                permissions: {
                    allowRead: boolean;
                    allowCreate: boolean;
                    allowEdit: boolean;
                    allowDelete: boolean;
                    allowViewAll: boolean;
                    allowModifyAll: boolean;
                    allowModifyListViews: boolean;
                }
            ) => {
                await tx.objectPermission.createMany({
                    data: objectIds.map((objectDefId) => ({
                        permissionSetId,
                        objectDefId,
                        ...permissions,
                    })),
                });
            };

            await createObjectPermissions(orgAdminSet.id, allObjectIds, {
                allowRead: true,
                allowCreate: true,
                allowEdit: true,
                allowDelete: true,
                allowViewAll: true,
                allowModifyAll: true,
                allowModifyListViews: true,
            });

            await createObjectPermissions(jiraAdminSet.id, jiraObjectIds, {
                allowRead: true,
                allowCreate: true,
                allowEdit: true,
                allowDelete: true,
                allowViewAll: true,
                allowModifyAll: true,
                allowModifyListViews: true,
            });

            await createObjectPermissions(jiraAgentSet.id, jiraObjectIds, {
                allowRead: true,
                allowCreate: true,
                allowEdit: true,
                allowDelete: false,
                allowViewAll: false,
                allowModifyAll: false,
                allowModifyListViews: false,
            });

            await createObjectPermissions(healthAdminSet.id, healthObjectIds, {
                allowRead: true,
                allowCreate: true,
                allowEdit: true,
                allowDelete: true,
                allowViewAll: true,
                allowModifyAll: true,
                allowModifyListViews: true,
            });

            await createObjectPermissions(healthStaffSet.id, healthObjectIds, {
                allowRead: true,
                allowCreate: true,
                allowEdit: true,
                allowDelete: false,
                allowViewAll: false,
                allowModifyAll: false,
                allowModifyListViews: false,
            });

            const directAssignments = [
                { userId: adminUserId, permissionSetId: orgAdminSet.id },
                { userId: jiraLead.id, permissionSetId: jiraAdminSet.id },
                { userId: jiraDev.id, permissionSetId: jiraAgentSet.id },
                { userId: jiraQa.id, permissionSetId: jiraAgentSet.id },
                { userId: clinicManager.id, permissionSetId: healthAdminSet.id },
                { userId: nurse.id, permissionSetId: healthStaffSet.id },
            ];

            for (const assignment of directAssignments) {
                const createdAssignment = await tx.permissionSetAssignment.upsert({
                    where: {
                        userId_permissionSetId: {
                            userId: assignment.userId,
                            permissionSetId: assignment.permissionSetId,
                        },
                    },
                    create: assignment,
                    update: {},
                    select: { id: true },
                });

                const existingDirectSource = await tx.permissionSetAssignmentSource.findFirst({
                    where: {
                        assignmentId: createdAssignment.id,
                        sourceType: "DIRECT",
                        permissionSetGroupId: null,
                    },
                    select: { id: true },
                });

                if (!existingDirectSource) {
                    await tx.permissionSetAssignmentSource.create({
                        data: {
                            assignmentId: createdAssignment.id,
                            sourceType: "DIRECT",
                        },
                    });
                }
            }

            await tx.appPermission.createMany({
                data: [
                    { permissionSetId: orgAdminSet.id, appId: jiraApp.id },
                    { permissionSetId: orgAdminSet.id, appId: healthcareApp.id },
                    { permissionSetId: jiraAdminSet.id, appId: jiraApp.id },
                    { permissionSetId: jiraAgentSet.id, appId: jiraApp.id },
                    { permissionSetId: healthAdminSet.id, appId: healthcareApp.id },
                    { permissionSetId: healthStaffSet.id, appId: healthcareApp.id },
                ],
            });

            // Sharing rules
            const findField = (fields: any[], apiName: string) => fields.find((field) => field.apiName === apiName);

            await tx.sharingRule.create({
                data: {
                    organizationId,
                    objectDefId: issueObj.id,
                    targetGroupId: jiraGroup.id,
                    name: "Share review issues to Jira team",
                    description: "Issues in review are visible to the Jira team.",
                    isActive: true,
                    sortOrder: 0,
                    accessLevel: ShareAccessLevel.READ,
                    criteria: {
                        logic: "ALL",
                        filters: [
                            {
                                fieldDefId: findField(issueFields, "status")?.id,
                                operator: "equals",
                                value: resolvePicklistCriteriaValue(findField(issueFields, "status")?.id, "In Review"),
                            },
                        ],
                    },
                },
            });
            sharingRuleObjectIds.add(issueObj.id);

            await tx.sharingRule.create({
                data: {
                    organizationId,
                    objectDefId: patientObj.id,
                    targetGroupId: healthGroup.id,
                    name: "Share insured patients",
                    description: "Patients with Medicare are visible to the healthcare team.",
                    isActive: true,
                    sortOrder: 0,
                    accessLevel: ShareAccessLevel.READ,
                    criteria: {
                        logic: "ALL",
                        filters: [
                            {
                                fieldDefId: findField(patientFields, "insurance")?.id,
                                operator: "equals",
                                value: resolvePicklistCriteriaValue(findField(patientFields, "insurance")?.id, "Medicare"),
                            },
                        ],
                    },
                },
            });
            sharingRuleObjectIds.add(patientObj.id);

            // Assignment rules
            await tx.assignmentRule.create({
                data: {
                    organizationId,
                    objectDefId: issueObj.id,
                    name: "Critical issues to triage",
                    description: "Critical priority issues enter the Jira triage queue.",
                    isActive: true,
                    sortOrder: 0,
                    targetType: AssignmentTargetType.QUEUE,
                    targetQueueId: jiraQueue.id,
                    criteria: {
                        logic: "ALL",
                        filters: [
                            {
                                fieldDefId: findField(issueFields, "priority")?.id,
                                operator: "equals",
                                value: resolvePicklistCriteriaValue(findField(issueFields, "priority")?.id, "Critical"),
                            },
                        ],
                    },
                },
            });

            await tx.assignmentRule.create({
                data: {
                    organizationId,
                    objectDefId: appointmentObj.id,
                    name: "Route scheduled appointments",
                    description: "Scheduled appointments enter the health intake queue.",
                    isActive: true,
                    sortOrder: 0,
                    targetType: AssignmentTargetType.QUEUE,
                    targetQueueId: healthQueue.id,
                    criteria: {
                        logic: "ALL",
                        filters: [
                            {
                                fieldDefId: findField(appointmentFields, "status")?.id,
                                operator: "equals",
                                value: resolvePicklistCriteriaValue(findField(appointmentFields, "status")?.id, "Scheduled"),
                            },
                        ],
                    },
                },
            });

            // Record generator helpers
            const createRecord = async (
                objDefId: number,
                data: Record<string, any>,
                ownerId: number,
                ownerQueueId?: number,
                ownerType: OwnerType = OwnerType.USER
            ) => {
                const fields = await tx.fieldDefinition.findMany({ where: { objectDefId: objDefId } });
                const recordName = deriveRecordName(fields, data);

                const record = await tx.record.create({
                    data: {
                        objectDefId: objDefId,
                        organizationId,
                        createdById: ownerId,
                        lastModifiedById: ownerId,
                        ownerId: ownerType === OwnerType.USER ? ownerId : null,
                        ownerQueueId: ownerType === OwnerType.QUEUE ? ownerQueueId ?? null : null,
                        ownerType,
                        name: recordName,
                    },
                });

                const fieldValues = Object.entries(data)
                    .map(([apiName, value]) => {
                        const fieldDef = fields.find((field) => field.apiName === apiName);
                        if (!fieldDef) return null;
                        const normalizedValue =
                            fieldDef.type === "Picklist"
                                ? resolvePicklistOptionId(fieldDef.id, value)
                                : value;
                        const payload = buildFieldDataPayload(fieldDef, normalizedValue);
                        return { recordId: record.id, fieldDefId: fieldDef.id, ...payload };
                    })
                    .filter(Boolean) as any[];

                if (fieldValues.length > 0) {
                    await tx.fieldData.createMany({ data: fieldValues });
                }

                return record;
            };

            const jiraAssignees = [jiraLead.name, jiraDev.name, jiraQa.name];
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const shiftDays = (days: number) => {
                const date = new Date(today);
                date.setDate(date.getDate() + days);
                return date.toISOString();
            };

            // Projects
            const projectRecords: number[] = [];
            const projectNames = ["Core CRM Platform", "Admin Workspace Refresh", "Patient Intake Portal"];
            for (let i = 0; i < projectNames.length; i += 1) {
                const record = await createRecord(
                    projectObj.id,
                    {
                        name: projectNames[i],
                        key: projectNames[i].split(" ")[0].substring(0, 3).toUpperCase(),
                        status: i === 2 ? "On Hold" : "Active",
                        start_date: shiftDays(-90 + i * 21),
                        end_date: shiftDays(21 + i * 35),
                        lead: jiraAssignees[0],
                    },
                    jiraUsers[i % jiraUsers.length]
                );
                projectRecords.push(record.id);
            }

            // Epics
            const epicRecords: number[] = [];
            for (let i = 0; i < 6; i += 1) {
                const record = await createRecord(
                    epicObj.id,
                    {
                        name: `Epic ${i + 1}`,
                        status: i % 3 === 0 ? "Done" : "In Progress",
                        project: projectRecords[i % projectRecords.length],
                        owner: jiraAssignees[i % jiraAssignees.length],
                        target_date: shiftDays(10 + i * 9),
                    },
                    jiraUsers[i % jiraUsers.length]
                );
                epicRecords.push(record.id);
            }

            // Issues
            const issuePriorities = ["Low", "Medium", "High", "Critical"];
            const issueStatuses = ["To Do", "In Progress", "In Review", "Done"];
            const issueTypes = ["Bug", "Story", "Task"];
            for (let i = 0; i < 18; i += 1) {
                const priority = issuePriorities[i % issuePriorities.length];
                const ownerId = jiraUsers[i % jiraUsers.length];
                const useQueue = priority === "Critical" && i % 5 === 0;

                await createRecord(
                    issueObj.id,
                    {
                        name: `Issue ${i + 1}: ${issueTypes[i % issueTypes.length]} workflow`,
                        status: issueStatuses[i % issueStatuses.length],
                        priority,
                        issue_type: issueTypes[i % issueTypes.length],
                        points: 1 + (i % 8),
                        due_date: shiftDays(-6 + i * 4),
                        project: projectRecords[i % projectRecords.length],
                        epic: epicRecords[i % epicRecords.length],
                        assignee: jiraAssignees[i % jiraAssignees.length],
                        reporter: jiraAssignees[(i + 1) % jiraAssignees.length],
                        blocked: i % 7 === 0,
                    },
                    ownerId,
                    useQueue ? jiraQueue.id : undefined,
                    useQueue ? OwnerType.QUEUE : OwnerType.USER
                );
            }

            // Providers
            const providerRecords: number[] = [];
            const providerNames = ["Dr. Avery", "Dr. Chen", "Dr. Morgan", "Dr. Patel"];
            for (let i = 0; i < providerNames.length; i += 1) {
                const record = await createRecord(
                    providerObj.id,
                    {
                        name: providerNames[i],
                        specialty: ["Primary Care", "Cardiology", "Pediatrics", "Orthopedics"][i % 4],
                        email: `provider${i + 1}@health.example.com`,
                        phone: `+1555${(100000 + i).toString().slice(-6)}`,
                    },
                    clinicManager.id
                );
                providerRecords.push(record.id);
            }

            // Patients
            const patientRecords: number[] = [];
            for (let i = 0; i < 12; i += 1) {
                const record = await createRecord(
                    patientObj.id,
                    {
                        name: `Patient ${i + 1}`,
                        email: `patient${i + 1}@health.example.com`,
                        phone: `+1888${(200000 + i).toString().slice(-6)}`,
                        dob: new Date(1980 + (i % 25), i % 12, (i % 28) + 1).toISOString(),
                        insurance: i % 3 === 0 ? "Medicare" : i % 3 === 1 ? "Private" : "Self-Pay",
                        status: i % 5 === 0 ? "Inactive" : "Active",
                        high_risk: i % 6 === 0,
                    },
                    healthUsers[i % healthUsers.length]
                );
                patientRecords.push(record.id);
            }

            // Appointments
            const appointmentStatuses = ["Scheduled", "Checked In", "Completed", "Canceled"];
            for (let i = 0; i < 16; i += 1) {
                const status = appointmentStatuses[i % appointmentStatuses.length];
                const useQueue = status === "Scheduled" && i % 4 === 0;
                const dateOffset =
                    status === "Scheduled"
                        ? 1 + i
                        : status === "Checked In"
                            ? -1 - (i % 3)
                            : status === "Completed"
                                ? -4 - i
                                : 2 + (i % 6);
                await createRecord(
                    appointmentObj.id,
                    {
                        name: `Appointment ${i + 1}`,
                        date: shiftDays(dateOffset),
                        status,
                        patient: patientRecords[i % patientRecords.length],
                        provider: providerRecords[i % providerRecords.length],
                        reason: i % 2 === 0 ? "Annual checkup" : "Follow-up",
                        follow_up: i % 5 === 0,
                    },
                    healthUsers[i % healthUsers.length],
                    useQueue ? healthQueue.id : undefined,
                    useQueue ? OwnerType.QUEUE : OwnerType.USER
                );
            }
        });

        await rebuildMetadataDependenciesForOrganization(organizationId);

        for (const objectDefId of sharingRuleObjectIds) {
            await recomputeSharingRulesForObject({
                organizationId,
                objectDefId,
            });
        }

        revalidatePath("/admin");
        revalidatePath("/app");
        return { success: true };
    } catch (error) {
        console.error("Failed to seed demo data:", error);
        return { success: false, error: "Failed to seed data" };
    }
}
