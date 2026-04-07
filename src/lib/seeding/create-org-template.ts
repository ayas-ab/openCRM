import { db } from "@/lib/db";
import { normalizePicklistApiName } from "@/lib/api-names";
import { USER_ID_FIELD_API_NAME, USER_OBJECT_API_NAME } from "@/lib/user-companion";

export async function createOrgTemplate(organizationId: number) {
    return await db.$transaction(async (tx) => {
        const createDefaultListView = async (objectDefId: number, pluralLabel: string) => {
            const nameField = await tx.fieldDefinition.findFirst({
                where: { objectDefId, apiName: "name" },
                select: { id: true },
            });

            if (!nameField) return;

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
                        create: [
                            {
                                fieldDefId: nameField.id,
                                sortOrder: 0,
                            },
                        ],
                    },
                },
            });
        };

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

        // Default Queue + Group (optional, can be managed in admin later)
        await tx.queue.create({
            data: {
                organizationId,
                name: "Unassigned",
                description: "Default queue for new records.",
            },
        });
        await tx.group.create({
            data: {
                organizationId,
                name: "All Users",
                description: "Default sharing group.",
            },
        });

        const userObj = await tx.objectDefinition.create({
            data: {
                organizationId,
                apiName: USER_OBJECT_API_NAME,
                label: "User",
                pluralLabel: "Users",
                icon: "Users",
                isSystem: true,
                description: "Represents an application user.",
            },
        });

        await tx.fieldDefinition.createMany({
            data: [
                { objectDefId: userObj.id, apiName: "name", label: "Name", type: "Text", required: true },
                {
                    objectDefId: userObj.id,
                    apiName: USER_ID_FIELD_API_NAME,
                    label: "UserId",
                    type: "Text",
                    required: true,
                    isExternalId: true,
                    isUnique: true,
                },
            ],
        });
        await createDefaultListView(userObj.id, userObj.pluralLabel);

        // 1. Company Object (Created first so others can lookup to it)
        const companyObj = await tx.objectDefinition.create({
            data: {
                organizationId,
                apiName: "company",
                label: "Company",
                pluralLabel: "Companies",
                icon: "Building",
                isSystem: true,
                description: "Represents a business or account.",
            },
        });

        await tx.fieldDefinition.createMany({
            data: [
                { objectDefId: companyObj.id, apiName: "name", label: "Company Name", type: "Text", required: true },
                { objectDefId: companyObj.id, apiName: "website", label: "Website", type: "Url" },
                {
                    objectDefId: companyObj.id,
                    apiName: "industry",
                    label: "Industry",
                    type: "Picklist",
                },
            ],
        });
        const companyIndustryField = await tx.fieldDefinition.findFirst({
            where: { objectDefId: companyObj.id, apiName: "industry" },
            select: { id: true },
        });
        await createPicklistOptions(companyIndustryField?.id, ["Tech", "Finance", "Retail", "Other"]);
        await createDefaultListView(companyObj.id, companyObj.pluralLabel);

        // 2. Contact Object
        const contactObj = await tx.objectDefinition.create({
            data: {
                organizationId,
                apiName: "contact",
                label: "Contact",
                pluralLabel: "Contacts",
                icon: "User",
                isSystem: true,
                description: "Represents a person.",
            },
        });

        await tx.fieldDefinition.createMany({
            data: [
                { objectDefId: contactObj.id, apiName: "name", label: "Full Name", type: "Text", required: true },
                { objectDefId: contactObj.id, apiName: "first_name", label: "First Name", type: "Text", required: true },
                { objectDefId: contactObj.id, apiName: "last_name", label: "Last Name", type: "Text", required: true },
                { objectDefId: contactObj.id, apiName: "email", label: "Email", type: "Email" },
                { objectDefId: contactObj.id, apiName: "phone", label: "Phone", type: "Phone" },
                { objectDefId: contactObj.id, apiName: "title", label: "Title", type: "Text" },
                // Lookup to Company
                { objectDefId: contactObj.id, apiName: "company", label: "Company", type: "Lookup", lookupTargetId: companyObj.id },
            ],
        });
        await createDefaultListView(contactObj.id, contactObj.pluralLabel);

        // 3. Opportunity Object
        const opportunityObj = await tx.objectDefinition.create({
            data: {
                organizationId,
                apiName: "opportunity",
                label: "Opportunity",
                pluralLabel: "Opportunities",
                icon: "DollarSign",
                isSystem: true,
                description: "Represents a potential deal.",
            },
        });

        await tx.fieldDefinition.createMany({
            data: [
                { objectDefId: opportunityObj.id, apiName: "name", label: "Opportunity Name", type: "Text", required: true },
                { objectDefId: opportunityObj.id, apiName: "amount", label: "Amount", type: "Number" },
                {
                    objectDefId: opportunityObj.id,
                    apiName: "stage",
                    label: "Stage",
                    type: "Picklist",
                    required: true,
                },
                { objectDefId: opportunityObj.id, apiName: "close_date", label: "Close Date", type: "Date" },
                // Lookup to Company
                { objectDefId: opportunityObj.id, apiName: "company", label: "Company", type: "Lookup", lookupTargetId: companyObj.id },
            ],
        });
        const opportunityStageField = await tx.fieldDefinition.findFirst({
            where: { objectDefId: opportunityObj.id, apiName: "stage" },
            select: { id: true },
        });
        await createPicklistOptions(opportunityStageField?.id, ["Prospecting", "Negotiation", "Closed Won", "Closed Lost"]);
        await createDefaultListView(opportunityObj.id, opportunityObj.pluralLabel);

        // 4. Case Object
        const caseObj = await tx.objectDefinition.create({
            data: {
                organizationId,
                apiName: "case",
                label: "Case",
                pluralLabel: "Cases",
                icon: "Briefcase",
                isSystem: true,
                description: "Represents a support issue.",
            },
        });

        await tx.fieldDefinition.createMany({
            data: [
                {
                    objectDefId: caseObj.id,
                    apiName: "name",
                    label: "Case Number",
                    type: "AutoNumber",
                    required: false,
                    options: {
                        autoNumber: {
                            prefix: "CASE-",
                            minDigits: 4,
                            nextValue: 1,
                        },
                    },
                },
                { objectDefId: caseObj.id, apiName: "subject", label: "Subject", type: "Text", required: true },
                { objectDefId: caseObj.id, apiName: "description", label: "Description", type: "Text" },
                {
                    objectDefId: caseObj.id,
                    apiName: "status",
                    label: "Status",
                    type: "Picklist",
                    required: true,
                },
                {
                    objectDefId: caseObj.id,
                    apiName: "priority",
                    label: "Priority",
                    type: "Picklist",
                },
                // Lookup to Company
                { objectDefId: caseObj.id, apiName: "company", label: "Company", type: "Lookup", lookupTargetId: companyObj.id },
            ],
        });
        const caseStatusField = await tx.fieldDefinition.findFirst({
            where: { objectDefId: caseObj.id, apiName: "status" },
            select: { id: true },
        });
        const casePriorityField = await tx.fieldDefinition.findFirst({
            where: { objectDefId: caseObj.id, apiName: "priority" },
            select: { id: true },
        });
        await createPicklistOptions(caseStatusField?.id, ["New", "Open", "Closed"]);
        await createPicklistOptions(casePriorityField?.id, ["Low", "Medium", "High"]);
        await createDefaultListView(caseObj.id, caseObj.pluralLabel);

        return { userObj, contactObj, companyObj, opportunityObj, caseObj };
    });
}
