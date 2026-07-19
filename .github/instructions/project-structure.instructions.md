---
description: Project structure, conventions, and coding guidelines for the 9Router codebase. Applies to all source code edits, reviews, and architectural decisions.
applyTo: '**/*'
---

# 9Router — Project Structure & Coding Guidelines

## What This Is

9Router (`9router-app`) is a local AI routing gateway + Next.js dashboard. It exposes one OpenAI-compatible endpoint (`/v1/*`) and routes traffic across 40+ upstream providers with format translation, model-combo fallback, multi-account fallback, OAuth/API-key credential management, token refresh, quota/usage tracking, and optional cloud sync.

### Two Published Artifacts (One Repo)

| Artifact | Location | npm name | Purpose |
|----------|----------|----------|---------|
| Dashboard + Gateway | root `package.json` | `9router-app` | Next.js server — actual routing engine |
| CLI Launcher | `cli/` | `9router` | Separate package — installs/starts server, manages tray |

## Directory Map

```
9router/
├── src/                          # Next.js app + dashboard + compat APIs
│   ├── app/
│   │   ├── api/                  # Management + compatibility APIs
│   │   │   ├── v1/               # OpenAI-compatible endpoint (routed from /v1/* by next.config.mjs)
│   │   │   ├── v1beta/           # Gemini-compatible endpoint
│   │   │   ├── providers/        # Provider CRUD APIs
│   │   │   ├── auth/             # Authentication APIs (login, oauth, keys)
│   │   │   ├── models/           # Model listing API
│   │   │   ├── combos/           # Model combo CRUD
│   │   │   ├── oauth/            # OAuth flow handlers
│   │   │   ├── settings/         # Dashboard settings
│   │   │   ├── usage/            # Usage/statistics
│   │   │   ├── keys/             # API key management
│   │   │   ├── mcp/              # MCP integration
│   │   │   ├── pricing/          # Pricing data
│   │   │   ├── proxy-pools/      # Proxy pool management
│   │   │   ├── pxpipe/           # PXPipe token saver
│   │   │   ├── translator/       # Translator test endpoints
│   │   │   ├── tags/             # Tag management
│   │   │   ├── tunnel/           # Tunnel management
│   │   │   ├── health/           # Health check
│   │   │   └── version/          # Version info
│   │   ├── dashboard/            # Dashboard pages (Next.js pages router style)
│   │   ├── login/                # Login page
│   │   ├── landing/              # Landing page
│   │   ├── callback/             # OAuth callback handlers
│   │   ├── layout.js             # Root layout
│   │   ├── page.js               # Root page (redirects)
│   │   └── globals.css           # Global styles
│   ├── lib/
│   │   ├── db/                   # SQLite persistence layer
│   │   │   ├── driver.js         # Adapter fallback: bun:sqlite → better-sqlite3 → node:sqlite → sql.js
│   │   │   ├── adapters/         # Per-runtime SQLite adapters
│   │   │   ├── repos/            # Per-entity repos (connectionsRepo, combosRepo, settingsRepo, etc.)
│   │   │   ├── migrations/       # Schema migrations
│   │   │   ├── paths.js          # DB file path resolver (DATA_DIR || ~/.9router/)
│   │   │   └── helpers/          # JSON column helpers, backups
│   │   ├── localDb.js            # Backward-compat shim → re-exports @/lib/db/index.js
│   │   ├── usageDb.js            # Usage + log persistence (~/.9router/usage.json, log.txt)
│   │   ├── requestDetailsDb.js   # Request detail logging DB
│   │   ├── oauth/                # OAuth flow helpers
│   │   ├── headroom/             # Headroom token compression
│   │   ├── pxpipe/               # PXPipe multimodal compression
│   │   ├── qoder/                # Qoder provider helpers
│   │   ├── tunnel/               # Tunnel helpers
│   │   ├── network/              # Network utilities
│   │   ├── auth/                 # Auth utilities
│   │   └── updater/              # App updater
│   ├── sse/                      # App-side SSE glue (entry → open-sse engine)
│   │   ├── handlers/             # Chat handler (combo expansion, account selection)
│   │   ├── services/             # Token refresh, credential management
│   │   └── utils/                # SSE-specific utilities
│   ├── store/                    # Zustand client stores
│   │   ├── index.js              # Re-exports all stores
│   │   ├── providerStore.js      # Provider state
│   │   ├── settingsStore.js      # App settings
│   │   ├── userStore.js          # User/auth state
│   │   ├── themeStore.js         # Theme preferences
│   │   ├── notificationStore.js  # Notification state
│   │   └── headerSearchStore.js  # Header search state
│   ├── shared/                   # Shared code (client + server)
│   │   ├── components/           # Reusable React components
│   │   ├── constants/            # Re-exported config from open-sse
│   │   ├── hooks/                # React hooks
│   │   ├── services/             # Shared API clients
│   │   └── utils/                # Shared utilities
│   ├── i18n/                     # Runtime i18n (client-side JSON-based)
│   │   ├── config.js             # Locale list + constants
│   │   ├── runtime.js            # Client: load translation JSON, translate() function
│   │   └── RuntimeI18nProvider.js # React context provider
│   ├── dashboardGuard.js         # Auth guard for dashboard routes
│   ├── proxy.js                  # Proxy middleware
│   └── models/                   # Data models
├── open-sse/                     # Provider-agnostic routing/translation ENGINE
│   ├── config/                   # ALL constants — NEVER hardcode elsewhere
│   │   ├── providers.js          # Provider definitions
│   │   ├── providerModels.js     # Model alias → model matrix
│   │   ├── models.js             # Model constants
│   │   ├── runtimeConfig.js      # Timeouts, token limits, retry config
│   │   ├── appConstants.js       # App-wide constants (endpoints, header builders)
│   │   └── *Constants.js         # Provider-specific constants
│   ├── translator/               # Format conversion (client ↔ provider)
│   │   ├── index.js              # Registry + translateRequest/translateResponse
│   │   ├── request/              # Request translators (e.g., openai-to-claude.js)
│   │   ├── response/             # Response translators
│   │   ├── schema/               # Enums: ROLE, CLAUDE_BLOCK, OPENAI_BLOCK
│   │   ├── concerns/             # Shared translation logic
│   │   ├── formats/              # Per-format helpers
│   │   └── formats.js            # Format enum
│   ├── executors/                # Per-provider upstream HTTP calls
│   │   ├── base.js               # BaseExecutor class
│   │   ├── default.js            # DefaultExecutor (OpenAI-compatible providers)
│   │   ├── index.js              # Executor registry map
│   │   └── {provider}.js         # One file per non-standard provider
│   ├── handlers/                 # Per-modality cores (chat, image, embedding, tts, stt, search)
│   │   ├── chatCore.js           # Main chat handler entry
│   │   ├── chatCore/             # Streaming/non-streaming/SSE-to-JSON sub-handlers
│   │   ├── embedingsCore.js      # Embedding handler
│   │   ├── imageGenerationCore.js # Image gen handler
│   │   ├── ttsCore.js            # TTS handler
│   │   └── sttCore.js            # STT handler
│   ├── providers/                # Provider registry + capabilities + pricing
│   │   ├── index.js              # PROVIDERS export
│   │   ├── registry/             # One file per provider
│   │   ├── REGISTRY_TEMPLATE.js  # Template for new providers
│   │   ├── capabilities.js       # Model capability resolver
│   │   ├── pricing.js            # Pricing data
│   │   └── shared.js             # Shared provider constants
│   ├── rtk/                      # Request Token Killer (pre-translate compression)
│   │   ├── index.js              # tool_result content compressor
│   │   ├── headroom.js           # External compress proxy
│   │   ├── caveman.js            # System prompt injector
│   │   └── filters/              # Per-tool compressors + autodetect
│   ├── transformer/              # Response format transformers
│   ├── shared/                   # Cross-provider auth/identity
│   ├── services/                 # Model, provider, combo, account fallback, token refresh
│   └── utils/                    # Stream handlers, SSE, error, proxy fetch, cloaking
├── tests/                        # Independent ESM vitest package
│   ├── unit/                     # Unit tests
│   ├── translator/               # Translator tests
│   ├── __baseline__/             # Regression baseline snapshots + known-fails
│   └── vitest.config.js          # Test config (resolves @/ and open-sse aliases)
├── cli/                          # CLI launcher (published separately as '9router')
│   ├── cli.js                    # CLI entry
│   ├── package.json              # Independent version
│   ├── scripts/                  # Build scripts
│   ├── src/cli/                  # CLI source
│   └── hooks/                    # npm hooks (postinstall, runtime detection)
├── docs/ARCHITECTURE.md          # Full system architecture docs
├── open-sse/AGENTS.md            # Engine-specific guide ("how to add X")
├── scripts/                      # Registry migration + maintenance scripts
├── skills/                       # AI skill definitions for 9Router
├── gitbook/                      # GitBook documentation site (separate Next.js app)
├── images/                       # Static images
├── public/                       # Public assets
│   ├── i18n/literals/            # Translation JSON files
│   └── icons/                    # App icons
└── i18n/                         # Translated README files
```

## Coding Conventions

### Language & Tooling

- **Plain JavaScript (ESM)** — no TypeScript. Use JSDoc for type annotations where helpful.
- **Path aliases** (from `jsconfig.json`):
  - `@/*` → `src/*`
  - `open-sse` → `open-sse`
  - `open-sse/*` → `open-sse/*`
- **Lint**: `eslint.config.mjs` extending `eslint-config-next` (core web vitals)
- **Commit style**: Conventional Commits — `feat(scope):`, `fix(scope):`, `chore(scope):`
- **Versioning**: Root and `cli/package.json` are versioned independently; log changes in `CHANGELOG.md`

### Naming & Code Style

- **camelCase** for variables, functions, methods
- **PascalCase** for classes (e.g., `BaseExecutor`, `DefaultExecutor`)
- **UPPER_SNAKE_CASE** for constants/enums (e.g., `ROLE`, `CLAUDE_BLOCK`, `FORMATS`)
- **Files**: kebab-case or camelCase as appropriate (e.g., `chatCore.js`, `providerModels.js`, `appConstants.js`)
- **No hardcoded strings** — use constants from `open-sse/config/` or `open-sse/translator/schema/`
- **Config-driven**: All provider/model/timeout/endpoint data lives in `open-sse/config/`, not scattered in code

### Import Conventions

```javascript
// From src/ code (Next.js app side):
import { getDb } from "@/lib/db";
import { getProviderConnections } from "@/lib/localDb";          // backward-compat shim
import { getProviderConnections } from "@/lib/db/index.js";       // preferred for new code
import { loadTranslations } from "@/i18n/runtime";
import { useProviderStore } from "@/store/providerStore";

// From open-sse/ code (engine side):
import { PROVIDERS } from "../providers/index.js";
import { register } from "../translator/index.js";
import { BaseExecutor } from "./base.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { ROLE, CLAUDE_BLOCK } from "../translator/schema/index.js";
```

### Client/Server Boundary

Files in `src/app/` are Next.js app router pages and API routes. Client components must have `"use client"` directive at the top. See Zustand stores in `src/store/` for the client-side state pattern.

## Architecture Rules

### 1. `src/sse/` vs `open-sse/` Boundary

- **`src/sse/`** — App-side entry glue: parses incoming requests, expands combos, selects accounts
- **`open-sse/`** — Provider-agnostic engine: translates formats, dispatches to executors, handles streaming

Cross this boundary **consciously**. The engine (`open-sse/`) is designed to be usable standalone and should not import from `src/`.

### 2. Request Flow

```
/v1/* request
  → next.config.mjs rewrite (/v1/* → /api/v1/*)
  → src/sse/handlers/chat.js (parse, combo expansion, account selection loop)
  → open-sse/handlers/chatCore.js (detect source format, translate, dispatch)
  → open-sse/executors/{provider}.js (per-provider upstream HTTP call)
  → open-sse/translator/* (client format ↔ provider format)
  → SSE stream back to client
```

### 3. Translator Pipeline

- **OpenAI is the pivot format** — all translation routes through OpenAI as the intermediate format
- **Direct routes** are preferred for fragile pairs (thinking blocks, tool ids, non-base64 images, `is_error`): register on the exact `source:target` pair to skip the lossy double-hop
- **Self-registration**: Translators call `register(from, to, reqFn, resFn)` as an import side effect. A new translator file **MUST be imported in `open-sse/translator/index.js`** or it never runs
- Add request translators to `open-sse/translator/request/`, response translators to `open-sse/translator/response/`
- Reuse shared logic from `open-sse/translator/schema/` and `open-sse/translator/concerns/`

### 4. Provider Registration

- One file per provider in `open-sse/providers/registry/`
- `providers/registry/index.js` is **auto-generated** — regenerate with `scripts/migrate-registry.mjs`, don't hand-edit
- To add a provider: copy `REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`
- Only add an executor in `open-sse/executors/` for **non-OpenAI-compatible** upstreams

### 5. Executor Pattern

```javascript
// BaseExecutor defines the interface (open-sse/executors/base.js):
//   getBaseUrls() → array of base URLs (for fallback)
//   buildUrl(model, stream, urlIndex, credentials)
//   buildHeaders(credentials, stream)
//   transformRequest(model, body, stream, credentials)
//   execute(model, body, stream, urlIndex, credentials, signal, ...)

// For OpenAI-compatible providers — no custom executor needed (DefaultExecutor handles it)
// For non-standard providers — subclass BaseExecutor, override as needed
// Register in open-sse/executors/index.js map
```

### 6. Persistence (SQLite)

- **State is in SQLite**, NOT `db.json` (ARCHITECTURE.md is stale on this point)
- Adapter fallback chain: `bun:sqlite` → `better-sqlite3` (optional dep) → `node:sqlite` (Node ≥22.5) → `sql.js` (pure-JS)
- `better-sqlite3` is in `optionalDependencies` — install never fails without build tools
- New code should import from `@/lib/db/index.js`
- Per-entity logic lives in `src/lib/db/repos/*` (e.g., `connectionsRepo.js`, `combosRepo.js`)
- Schema/migrations in `src/lib/db/migrations/`
- DB file location: `DATA_DIR` env var, else `~/.9router/`
- Usage/logs (`src/lib/usageDb.js`) live under `~/.9router` and do **not** follow `DATA_DIR`
- Repo pattern: each repo exports `getAll(db)`, `getById(db, id)`, `create(db, data)`, `update(db, id, data)`, `delete(db, id)`, `upsert(db, data)` using the `getAdapter()` from `driver.js`

### 7. RTK (Request Token Killer)

- Pre-translate hooks that compress `tool_result` content in-place to cut tokens
- **Fail-open**: any error returns null and leaves the body untouched — **never throw** out of them
- Skips `is_error`/`status:"error"` results to preserve traces
- Located in `open-sse/rtk/`

### 8. Security Considerations

- `custom-server.js` wraps Next standalone server to derive client IP from TCP socket and strip attacker-controlled `X-Forwarded-For` — preserve this when touching request/IP/rate-limit code
- Sensitive env vars: `JWT_SECRET`, `INITIAL_PASSWORD` (default `123456`), `API_KEY_SECRET`, `MACHINE_ID_SALT`
- Full env contract in `.env.example`

## Key Design Patterns

### Zustand Stores (Client State)

```javascript
"use client";
import { create } from "zustand";
// Exported as default. Contains: state fields, setters, async fetch methods.
// fetchXxx() skips network when cache is fresh (< CLIENT_STORE_TTL_MS)
```

### I18n Pattern

- Client-side runtime i18n (JSON files served from `/i18n/literals/{locale}.json`)
- Import `translate()` from `@/i18n/runtime` in any client component
- 35+ locales supported; English is the default (no translation JSON loaded)

### API Route Pattern

Next.js app router route handlers export HTTP method functions:

```javascript
// src/app/api/some-endpoint/route.js
export async function GET(request) { ... }
export async function POST(request) { ... }
```

### React Components

- Reusable components in `src/shared/components/`
- Use `"use client"` directive for interactive components
- Components are plain JSX functions (no TypeScript)
- Theming via CSS custom properties and `ThemeProvider`

## Tests

- **Vitest** ESM package in `tests/` — independent from root `npm test`
- Must `npm install` root deps first (tests import from `src/`)
- `vitest.config.js` resolves `@/` and `open-sse` aliases from repo root
- Not expected to be all-green: ~938 pass, ~64 fail on clean checkout
- Judge regressions with `tests/__baseline__/verify-no-regression.mjs`
- `*.real.test.js` make live provider calls — skip unless credentials are set

## Commands Quick Reference

```bash
# Dev (default port 20127, API at /v1, dashboard at /dashboard):
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev

# Build + production:
npm run build && PORT=20128 HOSTNAME=0.0.0.0 npm run start

# Bun variants: npm run dev:bun / build:bun / start:bun

# Lint: npx eslint .

# Test: cd tests && npx vitest run
# Single test: cd tests && npx vitest run unit/capabilities.test.js

# CLI pack: npm run cli:pack
```

## Documentation

Before making changes in these areas, read the authoritative docs:

- `docs/ARCHITECTURE.md` — Full system architecture: request lifecycle, combo/account fallback, OAuth, cloud sync, data model
- `open-sse/AGENTS.md` — Engine conventions, how to add a provider/executor/translator
- `.env.example` — Full environment variable contract

## Common Pitfalls

1. Don't hand-edit `open-sse/providers/registry/index.js` — it's auto-generated
2. Don't forget to import new translators in `open-sse/translator/index.js` — they self-register as side effects
3. Don't hardcode role/block/model strings — use `open-sse/translator/schema/` and `open-sse/config/`
4. Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — handle in their own executor
5. RTK hooks must return null on error, never throw — they mutate in-place
6. `ARCHITECTURE.md` is stale on persistence (says `db.json`, reality is SQLite under `src/lib/db/`)
7. Usage/logs (`usage.json`, `log.txt`) do NOT follow `DATA_DIR` — they always live under `~/.9router/`
8. Tests need root `npm install` first before `cd tests && npm install`
