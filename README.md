# JARVIS Personal Memory

JARVIS is a simple personal memory assistant. Type or speak a thought, save the exact wording, and ask for it later.

## Run locally

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/jarvis-memory run dev
```

The Replit workflows already provide the required `PORT` and `BASE_PATH` values for the web app. For a local Vite run outside Replit, set those values before starting the web package.

## Project structure

- `artifacts/jarvis-memory` — React/Vite frontend
- `artifacts/api-server` — Express API
- `lib/api-spec/openapi.yaml` — API contract
- `lib/db/src/schema` — PostgreSQL schema

## Database

The development build uses the provisioned PostgreSQL database and expects `DATABASE_URL`. Apply the schema with:

```bash
pnpm --filter @workspace/db run push
```

The `memories` table preserves both `original_text` and `current_text`. The `reminders` table is separate so future server-side notifications can be added without changing the memory model.

## Environment variables

See `.env.example` for the local variable names. Never commit real credentials.

## API codegen

After editing `lib/api-spec/openapi.yaml`, regenerate the shared client and validation schemas:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Current scope

The first build covers core capture, repeat, correction, natural-language lookup, searchable history, manual deletion, browser voice input, browser speech output, and PWA metadata. Supabase-backed authentication and per-user row-level security are intentionally the next integration step.