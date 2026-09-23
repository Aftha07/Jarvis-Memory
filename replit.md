# JARVIS Personal Memory

JARVIS is a personal memory assistant that saves exact thoughts, retrieves them through natural-language questions, and keeps a simple searchable history.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/jarvis-memory` — React/Vite web app with capture, ask, history, voice input, browser speech output, and PWA metadata.
- `artifacts/api-server/src/routes/memories.ts` — memory CRUD endpoints.
- `artifacts/api-server/src/routes/assistant.ts` — repeat, correction, search, and summary behavior.
- `artifacts/api-server/src/lib/memory.ts` — lightweight classification and extraction without a paid AI dependency.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `lib/db/src/schema/memories.ts` and `reminders.ts` — persistent memory and reminder storage.
- `artifacts/jarvis-memory/src/index.css` — JARVIS visual language and responsive layout.

## Architecture decisions

- The original transcript is stored separately from the current working text so corrections never erase what was first captured.
- Basic save, repeat, correction, and retrieval work without a paid AI service; an AI provider can be added behind the assistant route later.
- Reminder records are kept in their own table even though notifications are not wired yet, so server-side scheduling can be added without changing memory storage.
- Browser speech recognition and speech synthesis are optional enhancements; typed input always remains available.
- The current development build uses the provisioned PostgreSQL database; Supabase connection and authenticated user scoping are the next integration step.

## Product

- Save exact thoughts with automatic lightweight categories.
- Ask JARVIS to repeat the latest memory or find older memories.
- Correct the latest memory while preserving the original wording.
- Search and open memory details from a newest-first history.
- Use browser voice input and spoken replies when supported.
- Delete a memory manually with confirmation.

## User preferences

- Keep the product simple and personal; do not turn it into a CRM, ERP, or admin dashboard.

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- The artifact workflow supplies `PORT` and `BASE_PATH`; do not hard-code either into the app.
- Browser voice features vary by device and browser, so errors must leave typed capture usable.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
