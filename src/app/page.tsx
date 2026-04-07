import Image from "next/image";
import { Open_Sans, Poppins } from "next/font/google";
import { Button } from "@/components/ui/button";
import { PublicSiteFooter } from "@/components/shared/public-site-footer";
import { PublicSiteHeader } from "@/components/shared/public-site-header";
import { MermaidDiagram } from "@/components/shared/mermaid-diagram";
import type { LucideIcon } from "lucide-react";
import {
    AlignLeft,
    Bell,
    Boxes,
    Blocks,
    Calendar,
    CheckCircle2,
    CheckSquare,
    Database,
    FileUp,
    GitBranch,
    Github,
    Hash,
    History,
    Layers,
    LayoutDashboard,
    Link2,
    Lock,
    Mail,
    MessageSquare,
    Network,
    Paperclip,
    Phone,
    List,
    ShieldCheck,
    Sparkles,
    Type,
    Users,
    Workflow,
} from "lucide-react";

const headingFont = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bodyFont = Open_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const fieldTypes: Array<{ name: string; icon: LucideIcon }> = [
    { name: "Text", icon: Type },
    { name: "TextArea", icon: AlignLeft },
    { name: "Number", icon: Hash },
    { name: "Date", icon: Calendar },
    { name: "DateTime", icon: Calendar },
    { name: "Checkbox", icon: CheckSquare },
    { name: "Phone", icon: Phone },
    { name: "Email", icon: Mail },
    { name: "Url", icon: Link2 },
    { name: "Lookup", icon: Link2 },
    { name: "Picklist", icon: List },
    { name: "File", icon: Paperclip },
    { name: "AutoNumber", icon: Sparkles },
];

const adminControlAreas: Array<{ title: string; description: string; icon: LucideIcon }> = [
    {
        title: "App Builder",
        description: "Create apps, brand them, and attach object navigation by team use case.",
        icon: Blocks,
    },
    {
        title: "Dashboards",
        description: "Configure metric/list/chart widgets with typed filters and owner scopes.",
        icon: LayoutDashboard,
    },
    {
        title: "Data Loading",
        description: "Bulk insert/update/upsert via external IDs with tracked import jobs and row errors.",
        icon: FileUp,
    },
    {
        title: "Permissions",
        description: "Grant object-level CRUD, View All, Modify All, and app access by permission set.",
        icon: Lock,
    },
    {
        title: "Permission Set Groups",
        description: "Bundle permission sets into assignable groups for cleaner access administration.",
        icon: Users,
    },
    {
        title: "Sharing Rules",
        description: "Materialize group access to user-owned records using criteria and access level.",
        icon: Workflow,
    },
    {
        title: "Duplicate Rules",
        description: "Detect likely duplicates on create and edit with multi-field matching plus warn or block actions.",
        icon: ShieldCheck,
    },
    {
        title: "Assignment Rules",
        description: "Route new records to a user or queue with ordered, first-match criteria logic.",
        icon: GitBranch,
    },
    {
        title: "Groups",
        description: "Organize users for sharing targets and ownership-based access modeling.",
        icon: Users,
    },
    {
        title: "Queues",
        description: "Use queue ownership buckets and claim flow for distributed intake and triage.",
        icon: Bell,
    },
    {
        title: "Record Ownership Enforcement",
        description: "Record ownership is enforced at row level: user-owned, queue-owned, claim flow, and share-aware access checks.",
        icon: Users,
    },
    {
        title: "List Views",
        description: "Configure saved filters, columns, sorting, sharing, pinning, and custom logic expressions per object.",
        icon: LayoutDashboard,
    },
    {
        title: "Audit Trail",
        description: "Track field changes and owner transitions with timestamped history for accountability and compliance.",
        icon: History,
    },
    {
        title: "Objects",
        description: "Manage object identity, behavior flags, metadata-level governance, and where-used delete protection.",
        icon: Database,
    },
    {
        title: "Fields & Types",
        description: "Define typed fields, options, external IDs, uniqueness, lookup targets, and field where-used checks.",
        icon: Sparkles,
    },
    {
        title: "Validation Rules",
        description: "Protect data integrity with per-object condition logic and field constraints.",
        icon: ShieldCheck,
    },
    {
        title: "Record Pages",
        description: "Assign record page layouts per app and permission context with visibility rules.",
        icon: Layers,
    },
    {
        title: "Delete Safety",
        description: "Block object/field deletes when metadata still depends on them, with grouped where-used diagnostics.",
        icon: ShieldCheck,
    },
];

const featureGroups: Array<{
    title: string;
    subtitle: string;
    icon: LucideIcon;
    items: string[];
}> = [
        {
            title: "Metadata Platform",
            subtitle: "Build your CRM model at runtime",
            icon: Database,
            items: [
                "Custom objects and custom fields",
                "Typed EAV storage (Record + FieldData)",
                "Lookup relationships across objects",
                "Picklist option model with active/inactive states",
                "AutoNumber fields with prefix + counter control",
                "Per-object record page layout assignments",
                "Metadata dependency index for object/field where-used",
            ],
        },
        {
            title: "Data Quality",
            subtitle: "Block bad data before it lands",
            icon: ShieldCheck,
            items: [
                "Validation rules with ALL / ANY / CUSTOM expressions",
                "Duplicate rules with multi-field matching and warn/block actions",
                "Field-level and system-aware validation conditions",
                "Picklist-safe operators and active-option checks",
                "Typed number/date constraints and formula compatibility",
                "Inline or toast validation feedback delivery",
            ],
        },
        {
            title: "Ownership + Access",
            subtitle: "Enterprise-style permission model",
            icon: Lock,
            items: [
                "Permission sets and permission set groups",
                "App-level and object-level access controls",
                "View All / Modify All overrides",
                "Queue ownership with claim flow",
                "Group-based RecordShare materialization",
                "Tenant isolation by organizationId",
                "Delete permission and share-aware record delete checks",
            ],
        },
        {
            title: "Operational Rules",
            subtitle: "Rule engines and asynchronous processing",
            icon: GitBranch,
            items: [
                "Create-time assignment rules (user or queue)",
                "Criteria-based sharing rule recomputation",
                "Background worker via pg-boss queues",
                "Import job pipeline (PENDING -> RUNNING -> COMPLETE)",
                "Lookup resolution via external IDs during import",
                "Error CSV export with safe sanitization",
            ],
        },
        {
            title: "Productivity UI",
            subtitle: "Fast navigation and list intelligence",
            icon: LayoutDashboard,
            items: [
                "App builder with tailored navigation",
                "List views with filters, sort, expressions, and sharing",
                "Dashboard widgets (metric/list/chart)",
                "Global search with ranking and scoped access",
                "Record owner scope filters for lists/widgets",
                "Pinned views and user default preferences",
            ],
        },
        {
            title: "Collaboration + Audit",
            subtitle: "Context and accountability by default",
            icon: MessageSquare,
            items: [
                "Record comments with @mentions",
                "Assignment and mention notifications",
                "Field history tracking for changed values",
                "Owner history tracking for reassignment events",
                "Protected file attachments with MIME validation",
                "Import, ownership, and rule activity observability",
                "Hard record delete with inbound lookup cleanup",
            ],
        },
    ];

const techStackGroups: Array<{
    title: string;
    description: string;
    icon: LucideIcon;
    items: string[];
}> = [
        {
            title: "Application",
            description: "The main web app runs on the Next.js App Router with React and TypeScript.",
            icon: Blocks,
            items: ["Next.js 16", "React 19", "TypeScript"],
        },
        {
            title: "Data Layer",
            description: "Metadata, records, and access data are stored in PostgreSQL and accessed through Prisma.",
            icon: Database,
            items: ["Prisma ORM", "PostgreSQL"],
        },
        {
            title: "Authentication",
            description: "User sign-in and session handling are built on NextAuth.",
            icon: Lock,
            items: ["NextAuth"],
        },
        {
            title: "UI Layer",
            description: "The interface uses Tailwind for styling and Radix plus shadcn/ui primitives for components.",
            icon: LayoutDashboard,
            items: ["Tailwind CSS", "Radix UI", "shadcn/ui"],
        },
        {
            title: "Runtime Support",
            description: "State, validation, and background work use a focused set of supporting libraries.",
            icon: Workflow,
            items: ["TanStack Query", "Zod", "Zustand", "pg-boss"],
        },
        {
            title: "Testing",
            description: "Unit and component testing run through the Vitest-based test setup.",
            icon: CheckCircle2,
            items: ["Vitest"],
        },
    ];

const architectureDiagrams: Array<{
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    chart: string;
}> = [
        {
            id: "system-context",
            title: "System Context",
            description: "Public users interact with one web runtime. The app coordinates database, worker, and file storage boundaries.",
            icon: Network,
            chart: `
flowchart LR
    UA[Admin User Browser]
    US[Standard User Browser]
    WEB[Next.js Web Runtime]
    DB[(PostgreSQL)]
    WKR[Background Worker]
    FS[(Local Upload Storage)]

    UA -->|HTTPS| WEB
    US -->|HTTPS| WEB
    WEB -->|Prisma Reads/Writes| DB
    WEB -->|Enqueue Jobs| DB
    WKR -->|Poll/Consume Jobs| DB
    WKR -->|Apply Async Updates| DB
    WEB -->|Store & Stream Files| FS
`,
        },
        {
            id: "containers",
            title: "Runtime Containers",
            description: "Two cooperating runtimes share one data store: request-time Next.js and background worker execution.",
            icon: Boxes,
            chart: `
flowchart TB
    subgraph C1[Container A: Next.js Web Runtime]
        direction TB
        PAD_A[" "]
        WIDE_A["WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"]
        RG[Route Groups: auth / standard / admin]
        SA[Server Actions]
        API[API Routes]
        SC[Server Components]
        PAD_A ~~~ RG
        WIDE_A ~~~ RG
        style PAD_A fill:transparent,stroke:transparent,color:transparent
        style WIDE_A fill:transparent,stroke:transparent,color:transparent
    end

    subgraph C2[Container B: Worker Runtime]
        direction TB
        WIDE_B2["                        "]
        WRK[src/jobs/sharing-rule-worker.ts]
        Q1[sharing-rule.recompute]
        Q2[import.process]
        WIDE_B2 ~~~ WRK
        style WIDE_B2 fill:transparent,stroke:transparent,color:transparent
    end

    subgraph C3[Container C: PostgreSQL]
        CRM[CRM Data]
        META[Metadata + Access Model]
        JOBS[pgboss Schema]
    end

    subgraph C4[Container D: Upload Storage]
        direction TB
        WIDE_D["                        "]
        FILES[uploads/orgId/recordId/fieldId/attachmentId]
        WIDE_D ~~~ FILES
        style WIDE_D fill:transparent,stroke:transparent,color:transparent
    end

    C1 --> C3
    C1 --> C4
    C2 --> C3
    WRK --> Q1
    WRK --> Q2
`,
        },
        {
            id: "domain",
            title: "Domain Core (Metadata + EAV)",
            description: "Object and field definitions are metadata. Record values are typed rows in FieldData, with dependency indexing and duplicate-rule metadata alongside safe delete checks.",
            icon: Database,
            chart: `
erDiagram
    Organization ||--o{ ObjectDefinition : owns
    ObjectDefinition ||--o{ FieldDefinition : defines
    Organization ||--o{ MetadataDependency : indexes
    ObjectDefinition ||--o{ Record : stores
    Record ||--o{ FieldData : has
    FieldDefinition ||--o{ FieldData : typed_by

    Organization ||--o{ User : has
    User ||--o{ PermissionSetAssignment : receives
    PermissionSet ||--o{ ObjectPermission : grants
    PermissionSet ||--o{ AppPermission : grants

    Record ||--o{ RecordShare : shared_as
    Group ||--o{ RecordShare : receives
    Queue ||--o{ QueueMember : has
    Queue ||--o{ Record : queue_owns

    ObjectDefinition ||--o{ AssignmentRule : has
    ObjectDefinition ||--o{ DuplicateRule : has
    ObjectDefinition ||--o{ SharingRule : has
    ObjectDefinition ||--o{ ValidationRule : has
    DuplicateRule ||--o{ DuplicateRuleCondition : contains
    ValidationRule ||--o{ ValidationCondition : contains

    ObjectDefinition ||--o{ ImportJob : has
    ImportJob ||--o{ ImportRow : has
    Record ||--o{ FileAttachment : has
    MetadataDependency }o--|| ObjectDefinition : references
    MetadataDependency }o--o| FieldDefinition : references
`,
        },
        {
            id: "authorization",
            title: "Record Authorization Decision Flow",
            description: "Object permission gate executes first. Row-level ownership/share checks run only after object grant.",
            icon: ShieldCheck,
            chart: `
flowchart LR
    A[Request: Read / Edit / Delete / Create] --> B{Object Permission Granted?}
    B -- No --> X[Reject: Forbidden]
    B -- Yes --> C{Has ViewAll or ModifyAll?}
    C -- Yes --> G[Grant Access]
    C -- No --> D{OwnerType = USER and ownerId = currentUser?}
    D -- Yes --> G
    D -- No --> E{Action=Read and queue member of ownerQueue?}
    E -- Yes --> G
    E -- No --> F{RecordShare match USER or GROUP?}
    F -- Yes --> H[Grant by share level]
    F -- No --> X
`,
        },
        {
            id: "record-lifecycle",
            title: "Create Record Lifecycle",
            description: "Record creation layers validation, duplicate detection, assignment evaluation, and share materialization before commit.",
            icon: GitBranch,
            chart: `
sequenceDiagram
    actor U as User
    participant UI as Web UI
    participant SA as createRecord Action
    participant DB as PostgreSQL
    participant DR as Duplicate Rules
    participant AR as Assignment Rules
    participant SR as Sharing Rules

    U->>UI: Submit create form
    UI->>SA: createRecord(objectApiName, payload)
    SA->>DB: Check create permission
    SA->>DB: Load object fields + validations
    SA->>SA: Validate payload + unique + lookup
    SA->>DR: Evaluate active duplicate rules
    DR-->>SA: None, warn, or block
    SA->>AR: Evaluate active assignment rules
    AR-->>SA: owner target (USER/QUEUE)
    SA->>DB: TX create Record + FieldData
    alt ownerType = QUEUE
        SA->>DB: Create queue notifications
    else ownerType = USER
        SA->>SR: Evaluate matching sharing rules
        SR->>DB: Insert RecordShare rows
        SA->>DB: Create user notification if enabled
    end
    SA-->>UI: Success response + revalidation
`,
        },
        {
            id: "record-delete",
            title: "Delete Record Lifecycle",
            description: "Record delete is synchronous and transactional: permission gate, inbound lookup cleanup, hard delete, then storage cleanup.",
            icon: ShieldCheck,
            chart: `
sequenceDiagram
    actor U as User
    participant UI as Web UI
    participant SA as deleteRecord Action
    participant DB as PostgreSQL
    participant FS as Upload Storage

    U->>UI: Click Delete
    UI->>SA: deleteRecord(appApiName, objectApiName, recordId)
    SA->>DB: Check delete / modifyAll permission
    SA->>DB: Resolve row-level delete access
    SA->>DB: Find lookup fields targeting the record's object
    SA->>DB: TX clear inbound FieldData lookups
    SA->>DB: TX hard delete Record
    DB-->>SA: Cascades remove shares, comments, history, attachments metadata
    SA->>FS: Remove uploads/orgId/recordId subtree
    SA-->>UI: Success response + revalidation
`,
        },
        {
            id: "async-import",
            title: "Import + Async Job Pipeline",
            description: "Imports are staged: synchronous job creation, asynchronous row processing via worker queue.",
            icon: FileUp,
            chart: `
sequenceDiagram
    actor U as User
    participant UI as Import UI
    participant ACT as startImport Action
    participant DB as PostgreSQL
    participant Q as pg-boss Queue
    participant W as Worker

    U->>UI: Upload CSV
    UI->>ACT: startImport(object, mode, file)
    ACT->>DB: Permission + limits + mapping checks
    ACT->>DB: Create ImportJob(PENDING) + ImportRows
    ACT->>Q: Enqueue import.process(jobId)
    ACT-->>UI: Return job id

    W->>Q: Dequeue import.process
    W->>DB: Mark job RUNNING
    loop each row
        W->>W: Normalize + validate + resolve lookup
        alt valid
            W->>DB: Create/Update record
            W->>DB: Mark row success
        else invalid
            W->>DB: Store row errors JSON
        end
    end
    W->>DB: Mark job COMPLETED or FAILED
`,
        },
    ];

export default function Home() {
    return (
        <div className={`relative min-h-screen bg-[#FAFAFA] text-slate-900 ${bodyFont.className} selection:bg-blue-100 selection:text-blue-900`}>
            
            {/* Global Hero Background - Absolute Top */}
            <div className="absolute top-0 inset-x-0 h-[720px] pointer-events-none overflow-hidden">
                <div className="absolute inset-0 opacity-80 [mask-image:linear-gradient(to_bottom,white_55%,transparent_100%)]">
                    <Image src="/imgs/hero-bg.png" alt="Abstract Background" fill className="object-cover object-top" priority unoptimized />
                </div>
                {/* Background ambient gradients */}
                <div className="absolute top-[-12%] left-[-10%] h-[460px] w-[460px] rounded-full bg-blue-200/40 blur-[110px] mix-blend-multiply"></div>
                <div className="absolute top-[18%] right-[-5%] h-[380px] w-[380px] rounded-full bg-cyan-200/30 blur-[90px] mix-blend-multiply"></div>
            </div>

            <PublicSiteHeader />

            <main className="relative z-10 pt-10">
                <section id="about" className="relative isolate flex flex-col items-center text-center scroll-mt-24 pb-12 sm:pb-16">
                    <div className="mx-auto mt-2 flex max-w-5xl flex-col items-center px-4 sm:px-6 lg:px-8">
                        <SectionHeader
                            eyebrow="Overview"
                            title="Open-Source CRM for Developers"
                            description="openCRM is an open-source, metadata-driven, multi-tenant CRM learning project for developers. It shows how objects, fields, pages, apps, permissions, and workflows can be shaped through configuration instead of being hardcoded into the product."
                        />
                       
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                            <a href="https://github.com/ayas-ab/openCRM" target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="lg" className="cursor-pointer rounded-full border-amber-400 bg-amber-300 px-6 py-4 text-sm font-semibold text-amber-950 shadow-md shadow-amber-200/80 transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:bg-amber-200 hover:text-amber-950 hover:shadow-lg hover:shadow-amber-200">
                                    <Github className="mr-2 h-5 w-5" />
                                    View Source Code / Download
                                </Button>
                            </a>
                        </div>
                    </div>
                </section>

                <section
                    id="modules"
                    className="scroll-mt-24 border-y border-blue-50 bg-white/40 backdrop-blur-3xl py-24 relative"
                >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                        <SectionHeader
                            eyebrow="Admin Control Surface"
                            title="Configuration areas available in the app"
                            description="Everything below is implemented and available in the current codebase admin + standard surfaces, including the broader capability areas built on top of those configuration tools."
                        />
                        <div className="mt-14 space-y-8">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {adminControlAreas.map((area) => (
                                    <ControlAreaCard key={area.title} {...area} />
                                ))}
                            </div>
                            <div className="rounded-3xl border border-white/60 bg-white/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl shadow-blue-100/50">
                                <h3 className={`${headingFont.className} text-xl font-bold text-slate-900`}>
                                    Capability coverage
                                </h3>
                                <p className="mt-2 text-sm text-slate-600">
                                    The same configuration layer powers the broader platform capabilities below, from data modeling and validation to access, automation, collaboration, and productivity UX.
                                </p>
                                <div className="mt-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
                                    {featureGroups.map((group) => (
                                        <FeatureGroupCard key={group.title} {...group} />
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-3xl border border-white/60 bg-white/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl shadow-blue-100/50">
                                <h3 className={`${headingFont.className} text-xl font-bold text-slate-900`}>
                                    Supported Field Types
                                </h3>
                                <p className="mt-2 text-sm text-slate-600">
                                    Build object schemas from primitive, relational, and system-generated types.
                                </p>
                                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                    {fieldTypes.map((type) => {
                                        const Icon = type.icon;
                                        return (
                                            <div key={type.name} className="flex items-center gap-2 rounded-xl border border-blue-50 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-200 hover:shadow-md hover:shadow-blue-100">
                                                <Icon className="h-4 w-4 text-blue-500" />
                                                {type.name}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 shadow-inner">
                                    <Sparkles className="inline-block h-4 w-4 mr-2" />
                                    External ID is supported for Text fields and powers bulk data loading + lookup resolution.
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    id="stack"
                    className="scroll-mt-24 border-y border-blue-50 bg-white/40 backdrop-blur-3xl py-24 relative"
                >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                        <SectionHeader
                            eyebrow="Tech Stack"
                            title="Core technologies used in the project"
                            description="openCRM uses a straightforward TypeScript web stack: Next.js and React for the app, Prisma and PostgreSQL for data, NextAuth for authentication, and a small set of supporting libraries for UI, jobs, validation, and state."
                        />
                        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {techStackGroups.map((group) => {
                                const Icon = group.icon;
                                return (
                                    <article
                                        key={group.title}
                                        className="rounded-3xl border border-white/60 bg-white/60 p-6 backdrop-blur-xl shadow-lg shadow-blue-100/40 transition-all hover:border-blue-100 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-600 shadow-sm">
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className={`${headingFont.className} text-lg font-bold text-slate-900`}>
                                                    {group.title}
                                                </h3>
                                                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                                    {group.description}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-5 flex flex-wrap gap-2">
                                            {group.items.map((item) => (
                                                <span
                                                    key={item}
                                                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-700 shadow-sm"
                                                >
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section
                    id="architecture"
                    className="scroll-mt-24 py-24 relative"
                >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                        <SectionHeader
                            eyebrow="Architecture Center"
                            title="System architecture and execution diagrams"
                            description="Context, boundaries, data model, authorization flow, lifecycle behavior, and async import processing in one place."
                        />

                        <section className="mt-14 overflow-hidden rounded-3xl border border-white/60 bg-white/60 shadow-xl backdrop-blur-xl">
                            <div className="border-b border-white/40 bg-white/40 px-6 py-5 sm:px-8">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="rounded-xl border border-blue-100 bg-white p-2.5 text-blue-600 shadow-sm">
                                        <Users className="h-5 w-5" />
                                    </div>
                                    <div className={`rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-bold text-blue-600 shadow-sm ${headingFont.className}`}>
                                        00
                                    </div>
                                    <h3 className={`text-xl font-bold text-slate-900 sm:text-2xl ${headingFont.className}`}>
                                        User Types and Access Boundaries
                                    </h3>
                                </div>
                                <p className="mt-4 max-w-4xl text-sm text-slate-600 sm:text-base leading-relaxed">
                                    openCRM uses two runtime user roles. Both roles are authenticated users inside the same tenant and both are constrained by object permissions and row-level ownership/share logic.
                                </p>
                            </div>
                            <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-8">
                                <article className="rounded-2xl border border-white bg-white/50 p-5 shadow-sm transition-transform hover:-translate-y-1 hover:bg-white hover:shadow-md">
                                    <p className={`text-xs font-bold uppercase tracking-widest text-emerald-600 ${headingFont.className}`}>Standard User</p>
                                    <h4 className="mt-3 text-base font-bold text-slate-900">Business-facing app operator</h4>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                        Works in the standard app surface (`/app/*`) for daily record operations, list views, dashboards, comments, imports, and queue claim flows based on assigned permissions.
                                    </p>
                                </article>
                                <article className="rounded-2xl border border-white bg-white/50 p-5 shadow-sm transition-transform hover:-translate-y-1 hover:bg-white hover:shadow-md">
                                    <p className={`text-xs font-bold uppercase tracking-widest text-blue-600 ${headingFont.className}`}>Admin User</p>
                                    <h4 className="mt-3 text-base font-bold text-slate-900">Configuration operator</h4>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                        Works in the admin surface (`/admin/*`) to manage metadata and policy: apps, objects, fields, permissions, groups, queues, validation, duplicate rules, assignment rules, and sharing rules.
                                    </p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition-transform hover:-translate-y-1 hover:bg-slate-100 hover:shadow-md">
                                    <p className={`text-xs font-bold uppercase tracking-widest text-slate-600 ${headingFont.className}`}>How They Are Similar</p>
                                    <h4 className="mt-3 text-base font-bold text-slate-900">Same security model</h4>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                                        Both are tenant-scoped users authenticated through the same session stack. In non-admin record access paths, both still require object grants plus row access (owner, queue, or share) unless global overrides are explicitly granted.
                                    </p>
                                </article>
                            </div>
                        </section>

                        <div className="mt-12 grid gap-10">
                            {architectureDiagrams.map((diagram, index) => {
                                const Icon = diagram.icon;
                                return (
                                    <section
                                        key={diagram.id}
                                        id={`architecture-${diagram.id}`}
                                        className="group overflow-hidden rounded-3xl border border-white/60 bg-white/60 shadow-xl backdrop-blur-xl transition-all hover:border-white hover:shadow-2xl hover:shadow-blue-100"
                                    >
                                        <div className="border-b border-white/40 bg-white/40 px-6 py-5 sm:px-8 transition-colors group-hover:bg-white/60">
                                            <div className="flex flex-wrap items-center gap-4">
                                                <div className="rounded-xl border border-blue-100 bg-white p-2.5 text-blue-600 shadow-sm group-hover:bg-blue-50 group-hover:border-blue-200 transition-colors">
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className={`rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-bold text-blue-600 shadow-sm ${headingFont.className}`}>
                                                    {String(index + 1).padStart(2, "0")}
                                                </div>
                                                <h3 className={`text-xl font-bold text-slate-900 sm:text-2xl ${headingFont.className}`}>
                                                    {diagram.title}
                                                </h3>
                                            </div>
                                            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">{diagram.description}</p>
                                        </div>
                                        <div className="p-6 sm:p-8 bg-slate-50/50 relative overflow-hidden backdrop-blur-sm">
                                            <MermaidDiagram
                                                chart={diagram.chart}
                                                enableDownloads
                                                fileNameBase={`architecture-${diagram.id}`}
                                            />
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                </section>

            </main>

            <PublicSiteFooter />
        </div>
    );
}

function SectionHeader({
    eyebrow,
    title,
    description,
    align = "center",
}: {
    eyebrow: string;
    title: string;
    description: string;
    align?: "center" | "left";
}) {
    const alignment = align === "left" ? "text-left" : "text-center";
    return (
        <div className={alignment}>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">{eyebrow}</p>
            <h2 className={`${headingFont.className} mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl`}>
                {title}
            </h2>
            <p className={`mt-5 text-lg leading-relaxed text-slate-600 ${align === "left" ? "max-w-2xl" : "mx-auto max-w-3xl"}`}>
                {description}
            </p>
        </div>
    );
}

function FeatureGroupCard({
    title,
    subtitle,
    icon: Icon,
    items,
}: {
    title: string;
    subtitle: string;
    icon: LucideIcon;
    items: string[];
}) {
    return (
        <article className="group relative rounded-3xl border border-white bg-white/60 p-7 shadow-sm backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-100 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50">
            <div className="flex items-start gap-4">
                <div className="rounded-2xl border border-blue-50 bg-blue-50/50 p-3 text-blue-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-100">
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <h3 className={`${headingFont.className} text-xl font-bold text-slate-900`}>{title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                </div>
            </div>
            <ul className="mt-8 space-y-3">
                {items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
                        <span className="mt-[3px] text-blue-500">
                            <CheckCircle2 className="h-4 w-4" />
                        </span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </article>
    );
}

function ControlAreaCard({
    title,
    description,
    icon: Icon,
}: {
    title: string;
    description: string;
    icon: LucideIcon;
}) {
    return (
        <article className="group rounded-2xl border border-white bg-white/60 p-5 shadow-sm backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-100 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50">
            <div className="flex flex-col items-start gap-4">
                <div className="rounded-xl border border-blue-50 bg-blue-50/50 p-2.5 text-blue-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-100">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h4 className="text-base font-bold text-slate-900">{title}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
            </div>
        </article>
    );
}
