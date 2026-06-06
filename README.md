# FinCore — AI Native Finance Assistant via WhatsApp

> Multimodal finance tracking via WhatsApp. Text, voice, image — semua diproses otomatis oleh AI.

---

## Tech Stack

| Layer            | Tech                                |
| ---------------- | ----------------------------------- |
| Monorepo         | Turborepo + pnpm workspaces         |
| Backend          | NestJS (Fastify) + TypeScript       |
| Dashboard        | Next.js 15 (React 19)               |
| Queue            | BullMQ + Valkey (Redis-compatible)  |
| Database         | PostgreSQL + Drizzle ORM            |
| Validation       | Zod                                 |
| Logging          | Pino                                |
| WhatsApp         | WAHA (Sumopod)                      |
| AI Provider      | Sumopod (OpenAI-compatible gateway) |
| Voice            | Groq Whisper                        |
| Vision/OCR       | Gemini 1.5 Flash                    |
| Charts           | QuickChart.io                       |
| Image Processing | Sharp                               |

---

## Project Structure

```
FinCore/
├── apps/
│   ├── api/           → Webhook + REST API (NestJS, port 3000)
│   ├── worker/        → Async job processor (NestJS, port 3002)
│   ├── sender/        → Outbound WhatsApp sender (NestJS, port 3003)
│   └── dashboard/     → Web dashboard (Next.js 15, port 3001)
│
├── packages/
│   ├── ai/            → AI provider abstraction (Sumopod, Gemini, Groq)
│   ├── config/        → Env validation (Zod)
│   ├── contracts/     → DTOs, Zod schemas, event types, job data interfaces
│   ├── db/            → Drizzle schema + client + migrations
│   ├── event-publisher/ → FinancialEvent webhook delivery
│   ├── logger/        → Pino logger factory
│   ├── queue/         → BullMQ abstraction + shared Valkey singleton
│   ├── shared/        → Enums, constants, queue names, job names
│   ├── storage/       → Local media storage provider
│   └── utils/         → Formatting, date, string utilities
│
├── docs/              → BRD, PRD, tech stack, DB schema, task docs, checkpoints
├── infrastructure/    → Dockerfiles, reset-db script
└── docker-compose.yml
```

---

## Worker Processors (14 domain folders)

```
apps/worker/src/processors/
├── base.processor.ts               ← Shared abstract BaseProcessor
├── ai/                              (AI extraction + resolvers + saver)
├── budget/                          (Budget CRUD + check + rollover)
├── confirmation/                    (Transaction confirmation handler)
├── custom-command/                  (Custom CRUD: add/list/search)
├── event/                           (FinancialEvent webhook publishing)
├── incoming/                        (Message router + welcome)
├── monthly/                         (Monthly report generation)
├── ocr/                             (Image OCR + guardrail)
├── recurring/                       (Recurring bill setup + reminder)
├── report/                          (Report generation + chart)
├── settings/                        (User settings: /daftar, /atur)
├── transaction/                     (Transaction delete/confirm/edit)
└── voice/                           (Voice transcription + guardrail)

apps/worker/src/lib/
├── ai-cost.ts                       ← AI token cost calculator
├── date-utils.ts                    ← getCurrentPeriod(), fmtCurrency()
├── media-downloader.ts              ← Shared WAHA media downloader
└── user-lookup.ts                   ← findUserByPhone() DRY helper
```

---

## Message Flow

```
WhatsApp → WAHA → Cloudflare Tunnel → Webhook (api)
                                         ├── Save Raw Message
                                         ├── Enqueue to Worker
                                         │
Worker:
  ├── Voice   → Groq Whisper → Guardrail → AI Extraction
  ├── Image   → Gemini Vision → Guardrail → AI Extraction
  ├── Text    → AI Extraction → Save Transaction → Event Publish → Budget Check
  └── Command → /hapus, /ubah, /budget, /atur, /daftar, /tambah, /lihat, /cari
                                         │
                                    Sender → WhatsApp Reply
```

---

## Quick Start

### 1. Prerequisites

```bash
node >= 20
pnpm >= 9
docker & docker compose
```

### 2. Clone & Install

```bash
git clone <repo>
cd fincore

cp .env.example .env
# Edit .env sesuai kebutuhan

pnpm install
```

### 3. Start Infrastructure

```bash
pnpm docker:up           # PostgreSQL, Valkey, Bull Board, Cloudflare Tunnel
docker compose ps        # verify status
```

### 4. Database Setup

```bash
pnpm db:generate         # Generate migrations
pnpm db:migrate          # Run migrations
pnpm db:studio           # Open Drizzle Studio (optional)
```

### 5. Run Development

```bash
pnpm dev                 # All apps
pnpm dev:api             # API only (port 3000)
pnpm dev:worker          # Worker only (port 3002)
pnpm dev:sender          # Sender only (port 3003)
```

Dashboard runs at `http://localhost:3001`.

---

## Ports

| Service     | Port | URL                        |
| ----------- | ---- | -------------------------- |
| API         | 3000 | http://localhost:3000      |
| API Swagger | 3000 | http://localhost:3000/docs |
| Dashboard   | 3001 | http://localhost:3001      |
| Bull Board  | 3010 | http://localhost:3010      |
| Worker      | 3002 | internal only              |
| Sender      | 3003 | internal only              |
| PostgreSQL  | 5432 | -                          |
| Valkey      | 6379 | -                          |

---

## Environment Variables

See `.env.example` for the full list.

Required:

| Variable                  | Purpose                       |
| ------------------------- | ----------------------------- |
| `DATABASE_URL`            | PostgreSQL connection         |
| `VALKEY_URL`              | Valkey/Redis connection       |
| `CLOUDFLARE_TUNNEL_TOKEN` | WAHA webhook tunnel           |
| `SUMOPOD_API_KEY`         | AI provider API key           |
| `SUMOPOD_BASE_URL`        | AI provider base URL          |
| `WAHA_BASE_URL`           | WAHA (WhatsApp API) URL       |
| `WAHA_API_KEY`            | WAHA API key                  |
| `GROQ_API_KEY`            | Groq Whisper (voice)          |
| `GEMINI_API_KEY`          | Gemini Vision (OCR)           |
| `FINCORE_TRIGGER_PREFIX`  | Command prefix (default: `/`) |

---

## Available Commands (WhatsApp)

| Command                                    | Description                       |
| ------------------------------------------ | --------------------------------- |
| `Makan siang 35rb gopay`                   | Record expense (natural language) |
| `/daftar [Nama]`                           | Register new user                 |
| `/hapus` / `/hapus [keyword]`              | Delete transaction                |
| `/ubah [keyword]`                          | Edit transaction                  |
| `/konfirmasi`                              | List pending confirmations        |
| `/budget set [kategori] [nominal]`         | Set monthly budget                |
| `/budget cek`                              | Check budget status               |
| `/budget hapus [kategori]`                 | Delete budget                     |
| `/tambah metode [nama]`                    | Add payment method                |
| `/tambah kategori [nama]`                  | Add expense category              |
| `/lihat metode` / `/lihat kategori`        | List methods/categories           |
| `/cari [keyword]` / `/cari #[tag]`         | Search transactions               |
| `/atur` / `/settings`                      | View settings                     |
| `/atur nama [nama]`                        | Change display name               |
| `/atur laporan [daily/weekly/monthly/off]` | Report schedule                   |
| `/atur jam [HH:MM]`                        | Report delivery time              |
| `/laporan` / `/summary`                    | Generate report                   |
| `/bantuan`                                 | Help guide                        |
