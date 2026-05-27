# FinCore — AI Native Finance Assistant via WhatsApp

> Multimodal finance tracking via WhatsApp. Text, voice, image — semua diproses otomatis.

---

## Tech Stack

| Layer       | Tech                        |
| ----------- | --------------------------- |
| Backend     | NestJS (TypeScript)         |
| Monorepo    | Turborepo + pnpm workspaces |
| Queue       | BullMQ + Valkey             |
| Database    | PostgreSQL                  |
| ORM         | Drizzle ORM                 |
| Validation  | Zod                         |
| Logging     | Pino                        |
| WhatsApp    | Sumopod (Waha)              |
| AI Provider | Sumopod                     |
| Voice       | Groq Whisper                |
| Vision/OCR  | Gemini 1.5 Flash            |

---

## Project Structure

```
FinCore/
├── apps/
│   ├── api/        → Webhook + REST API (NestJS)
│   ├── worker/     → Async job processor (NestJS)
│   └── sender/     → Outbound WhatsApp sender (NestJS)
│
├── packages/
│   ├── db/         → Drizzle schema + client
│   ├── shared/     → Enums, constants, types
│   ├── contracts/  → DTOs, Zod schemas, event types
│   ├── ai/         → AI provider abstraction layer
│   ├── queue/      → BullMQ abstraction
│   ├── logger/     → Pino logger factory
│   ├── config/     → Env validation (Zod)
│   ├── utils/      → Shared utilities
│   └── analytics/  → Analytics helpers
│
└── infrastructure/
    ├── docker/
    ├── cloudflare/
    └── monitoring/
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

# Copy env
cp .env.example .env
# Edit .env sesuai kebutuhan

# Install all dependencies
pnpm install
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL, Valkey, Bull Board, Cloudflare Tunnel
pnpm docker:up

# Cek status
docker compose ps
```

### 4. Database Setup

```bash
# Generate migrations
pnpm db:generate

# Run migrations
pnpm db:migrate

# Opsional: buka Drizzle Studio
pnpm db:studio
```

### 5. Run Development

```bash
# Run semua apps sekaligus
pnpm dev

# Atau run individual
pnpm dev:api
pnpm dev:worker
pnpm dev:sender
```

---

## Ports

| Service     | Port | URL                        |
| ----------- | ---- | -------------------------- |
| API         | 3000 | http://localhost:3000      |
| API Swagger | 3000 | http://localhost:3000/docs |
| Bull Board  | 3010 | http://localhost:3010      |
| Worker      | 3002 | internal only              |
| Sender      | 3003 | internal only              |
| PostgreSQL  | 5432 | -                          |
| Valkey      | 6379 | -                          |

---

## Environment Variables

Lihat `.env.example` untuk daftar lengkap.

Wajib diisi:

- `DATABASE_URL`
- `VALKEY_URL`
- `CLOUDFLARE_TUNNEL_TOKEN`
- `SUMOPOD_API_KEY` + `SUMOPOD_BASE_URL`
- `GROQ_API_KEY` (untuk voice transcription)
- `GEMINI_API_KEY` (untuk OCR/vision)

---

## Message Flow

```
WhatsApp → Sumopod (Waha)               → Cloudflare Tunnel → Webhook (api) → Save Raw → Enqueue → Worker
                                                                            ├── Voice → Groq Whisper → AI Extraction
                                                                            ├── Image → Gemini Vision → AI Extraction
                                                                            └── Text → AI Extraction → Save Transaction
                                                                                                          ↓
                                                                                               Sender → WhatsApp Reply
```
