# openCRM

openCRM is an open-source, metadata-driven, multi-tenant CRM learning project for developers. It shows how a CRM can be shaped through configuration instead of hardcoding every object, field, page, permission, and workflow into the product. Each organization works inside its own isolated tenant, with a standard workspace for daily work and an admin workspace for configuring how the CRM behaves.

## Standard App

![openCRM standard dashboard](docs2/images/standard-dashboard.png)

### Admin Area

![openCRM admin dashboard](docs2/images/admin-dashboard.png)

## User Manual

The User manual lives in `docs2/` and is written as a user guide with screenshots and step-by-step explanations.

- **Start here:** [User Manual / Documentation](docs2/01-overview.md)
- **Setup order:** [Step-by-Step Getting Started Workflow](docs2/14-step-by-step-getting-started.md)

## Features

### Standard app

- `🧭` App-based navigation and dashboards for day-to-day work
- `📄` Record detail pages with history and edit flows
- `🔎` Global search across readable records
- `🔔` Notifications for work that needs attention
- `📋` List views with filters, settings, saved views, and layout control
- `📥` Bulk import for supported objects

### Configuration areas available in the app

- `🧱` Objects and fields
- `🪄` Record pages and layout design
- `📊` Apps and dashboard builder
- `👤` Users
- `👥` Groups
- `📚` Queues
- `🛡️` Permission sets and permission groups
- `🔁` Sharing rules
- `📌` Assignment rules
- `🧹` Duplicate rules
- `✅` Validation rules

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- PostgreSQL
- Prisma ORM
- NextAuth
- Tailwind CSS
- Radix UI and shadcn/ui
- TanStack Query
- Zustand
- pg-boss
- Vitest

## Prerequisites

Before running openCRM, install:

- Node.js 20+
- npm
- PostgreSQL 14+

Make sure PostgreSQL is running and that you have created a database for the app before starting setup.

## Local Setup

These run instructions are for local setup on your own machine.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public"
NEXTAUTH_SECRET="replace-with-a-strong-secret"
NEXTAUTH_URL="http://localhost:3000"
JWT_SECRET="replace-with-a-strong-secret"
AUTH_TRUST_HOST="true"
```

### 3. Prepare the database

This repo assumes a fresh-install workflow. There are no checked-in Prisma migrations, so initialize the schema directly:

```bash
npx prisma generate
npx prisma db push
```

### 4. Run the app in development

Run the app in development with one web process and one worker process.

Development mode is intended for local development only. It will run noticeably slower than a local production build.
#### Web server

```bash
npm run dev
```

#### Development worker

```bash
npm run jobs:worker:dev
```

Use the worker in development as well. Without it, these workflows will not complete:

- sharing-rule recomputation
- import processing

### 5. Run the app in production

Production requires two long-running processes:

- web server
- background worker

For local testing, production mode usually runs faster than development mode because it uses the built application instead of the live development server.

#### 1. Build the application

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
```

#### 2. Start the web server

```bash
npm start
```

#### 3. Start the worker

```bash
npm run jobs:worker
```

In production, run both processes under a process manager instead of manual terminals.

## Cloud Setup

If you are deploying openCRM to a VPS, cloud VM, container host, or any machine that is not your local pc, use the production setup above.

In cloud environments, keep the same two long-running processes:

- web server
- background worker

Run both under a process manager such as `pm2` or Docker instead of leaving them attached to terminal sessions.

Example with `pm2`:

```bash
pm2 start npm --name opencrm-web -- start
pm2 start npm --name opencrm-worker -- run jobs:worker
```

## Technical Documentation

- **Start here:** [Technical Documentation for Developers](Technical%20Documentation/01-index.md)

## Access Model

openCRM applies access in two stages:

1. object-level permission
2. record-level access through ownership, queues, groups, and sharing

In practice, a user must have the base permission first. After that, record ownership and sharing determine whether a specific record is visible or actionable.

That access model operates inside the current organization, so users, records, groups, queues, and sharing stay inside the same tenant boundary.

Read the manual sections here:

- [Admin Access and Permissions](docs2/05-admin-access-and-permissions.md)
- [Record Ownership and Sharing](docs2/06-record-ownership-and-sharing.md)

## Architecture

### System Context

This diagram shows the main runtime shape of the application: user browsers, the Next.js web runtime, PostgreSQL, background workers, and local upload storage.

![openCRM system context](docs2/images/architecture-system-context.svg)

### Runtime Containers

This view shows the main container-level responsibilities inside the application runtime.

![openCRM runtime containers](docs2/images/architecture-containers.svg)

### Domain Model

This diagram summarizes the metadata-driven core of the platform: objects, fields, layouts, access rules, and the record engine that sits underneath the UI.

![openCRM domain architecture](docs2/images/architecture-domain.svg)

### Authorization

This diagram shows the basic access evaluation model: permission first, then record-level evaluation through ownership, queues, or sharing.

![openCRM authorization architecture](docs2/images/architecture-authorization.svg)

### Record Lifecycle and Delete Flow

These diagrams describe how records move through their lifecycle and how delete behavior is handled safely.

![openCRM record lifecycle](docs2/images/architecture-record-lifecycle.svg)

![openCRM record delete flow](docs2/images/architecture-record-delete.svg)

### Async Import Flow

Imports are staged and processed asynchronously. The user submits the file, the job is queued, and the background worker processes the rows and records the outcome.

![openCRM async import architecture](docs2/images/architecture-async-import.svg)
