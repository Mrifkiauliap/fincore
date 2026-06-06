# Checkpoint #1 — Timezone, Analytics, Observability & Security

**Tanggal:** 2026-06-06
**Cakupan:** Full-stack — `@fincore/utils`, `@fincore/ai`, `@fincore/db`, `apps/api`, `apps/worker`, `apps/dashboard`

---

## 1. Timezone-Aware di Semua Module

### Problem

`new Date()` dan `dayjs()` hardcode `Asia/Jakarta` atau tanpa zona sama sekali. Greeting bot, komparasi budget, insight, dan reminder tidak menghormati timezone user.

### Solution

Semua `new Date()` dan `dayjs()` sekarang merujuk ke `user.timezone` (default `"Asia/Jakarta"`).

| Package          | File                                                                                                               | Change                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `@fincore/utils` | [`packages/utils/src/date.ts`](packages/utils/src/date.ts)                                                         | `DEFAULT_TIMEZONE`, `dayjsInTz()`, `nowInTz()`       |
| `@fincore/ai`    | [`packages/ai/src/interfaces/index.ts`](packages/ai/src/interfaces/index.ts)                                       | `timezone?: string` di `ExtractionContext`           |
| `@fincore/ai`    | [`packages/ai/src/providers/sumopod.provider.ts`](packages/ai/src/providers/sumopod.provider.ts)                   | AI prompt waktu pake timezone dari context           |
| `@fincore/ai`    | [`packages/ai/package.json`](packages/ai/package.json)                                                             | Tambah `@fincore/utils` dependency                   |
| `api`            | [`apps/api/src/modules/webhook/webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts)               | `getGreetingReply()` pake `dayjsInTz(user.timezone)` |
| `worker`         | [`apps/worker/src/processors/ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts)   | Context + transaction date pake user tz              |
| `worker`         | [`apps/worker/src/processors/custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts) | Date display format pake `dayjs().tz(tz)`            |
| `dashboard`      | [`apps/dashboard/src/app/api/insights/route.ts`](apps/dashboard/src/app/api/insights/route.ts)                     | Semua `dayjs()` → `dayjs().tz(tz)`                   |
| `dashboard`      | [`apps/dashboard/src/app/api/stats/route.ts`](apps/dashboard/src/app/api/stats/route.ts)                           | `sixMonthsAgo` di user tz                            |
| `dashboard`      | [`apps/dashboard/src/app/api/budgets/route.ts`](apps/dashboard/src/app/api/budgets/route.ts)                       | `startOfMonth`/`endOfMonth` di user tz               |
| `dashboard`      | [`apps/dashboard/src/app/api/transactions/route.ts`](apps/dashboard/src/app/api/transactions/route.ts)             | Default `transactionDate` di user tz                 |
| `dashboard`      | [`apps/dashboard/src/app/api/transactions/[id]/route.ts`](apps/dashboard/src/app/api/transactions/[id]/route.ts)   | Update `transactionDate` di user tz                  |
| `dashboard`      | [`apps/dashboard/src/app/api/recurring-bills/route.ts`](apps/dashboard/src/app/api/recurring-bills/route.ts)       | `nextReminderAt` di user tz                          |

**Prinsip:** DB tetap UTC. Semua interpretasi waktu terjadi di application layer.

---

## 2. Fix Config Production (`ECONNREFUSED 127.0.0.1:5432`)

### Problem

Dashboard container connect ke `127.0.0.1:5432` bukan `postgres:5432`. [`loadEnv()`](packages/config/src/index.ts:12) di `@fincore/config` membaca `.env` dari Next.js standalone build artifact dan override env Docker Compose.

### Solution

[`packages/config/src/index.ts`](packages/config/src/index.ts:13):

```typescript
function loadEnv() {
  if (process.env.NODE_ENV === "production") {
    return; // Skip — Docker/Compose inject env vars
  }
  // ... cari .env hanya untuk dev
}
```

---

## 3. Dashboard Undefined WA Link

### Problem

Halaman login menampilkan `https://wa.me/undefined?text=undefineddashboard` karena `getConfig("WAHA_BOT_NUMBER")` dan `getConfig("FINCORE_TRIGGER_PREFIX")` return `undefined` di production SSR.

### Solution

[`apps/dashboard/src/app/(auth)/login/page.tsx`](<apps/dashboard/src/app/(auth)/login/page.tsx:49>):

```tsx
const waBotNumber = getConfig("WAHA_BOT_NUMBER") ?? "";
const prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
// Conditional render: fallback warning kalo ga di-set
```

---

## 4. Dashboard Volume Mount Media

### Problem

Dashboard container ga mount volume uploads — `resolve(process.cwd(), "../../uploads")` nge-resolve ke path yang ga exist.

### Solution

[`docker-compose.yml`](docker-compose.yml:136): tambah `volumes: - ${LOCAL_UPLOAD_DIR}:/uploads` ke dashboard service.

---

## 5. Idempotency Guard di AI Extraction Processor

### Problem

`AiExtractionProcessor` tidak punya dedup guard. BullMQ retry/stalled job bisa insert transaksi duplikat.

### Solution

[`apps/worker/src/processors/ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:80):

```typescript
// Cek raw_messages.processingStatus sebelum proses
const [existingMsg] = await db
  .select({ status: rawMessages.processingStatus })
  .from(rawMessages)
  .where(eq(rawMessages.id, data.rawMessageId))
  .limit(1);

if (
  existingMsg &&
  (existingMsg.status === "done" ||
    existingMsg.status === "pending_confirmation")
) {
  return; // skip — already processed
}
```

**Dedup layers sekarang:**
| Layer | Mekanisme |
|-------|-----------|
| `IncomingMessageProcessor` | `inFlightMessages` Set (concurrent) |
| `IncomingMessageProcessor` | DB unique `waMessageId` (cross-process) |
| `AiExtractionProcessor` | DB `processingStatus` check (retry/stalled) |

---

## 6. Analytics & Observability System

### Database

| File                                                                                       | Purpose                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/db/src/schema/analytics-events.ts`](packages/db/src/schema/analytics-events.ts) | `analytics_events` table: category enum (`user`, `transaction`, `ai`, `queue`, `system`), event name, metadata JSONB, 4 indexes |
| [`packages/db/src/index.ts`](packages/db/src/index.ts:37)                                  | `trackEvent()` fire-and-forget helper                                                                                           |

### API Endpoints

| Endpoint             | File                                                                                             | Features                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `GET /api/analytics` | [`apps/dashboard/src/app/api/analytics/route.ts`](apps/dashboard/src/app/api/analytics/route.ts) | `?metric=overview\|daily\|ai\|users&days=30` |
| `GET /api/health`    | [`apps/dashboard/src/app/api/health/route.ts`](apps/dashboard/src/app/api/health/route.ts)       | DB ping, uptime, timestamp                   |

### Web Pages (Owner-only)

| URL                           | File                                                                                                                       | Content                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/dashboard/system`           | [`apps/dashboard/src/app/dashboard/system/page.tsx`](apps/dashboard/src/app/dashboard/system/page.tsx)                     | System Logs + nav buttons ke Analytics & Health                                                    |
| `/dashboard/system/analytics` | [`apps/dashboard/src/app/dashboard/system/analytics/page.tsx`](apps/dashboard/src/app/dashboard/system/analytics/page.tsx) | Stats cards, Events breakdown, AI performance, Users — dengan time range selector (7d/14d/30d/90d) |
| `/dashboard/system/health`    | [`apps/dashboard/src/app/dashboard/system/health/page.tsx`](apps/dashboard/src/app/dashboard/system/health/page.tsx)       | Overall status, individual checks, uptime, refresh button                                          |

---

## 7. Owner-Only Access Control (System Routes)

### Problem

Halaman analytics & health bisa diakses semua user yang login.

### Solution

**3-layer protection:**

| Layer       | File                                                                                                                                                                    | Mechanism                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Auth helper | [`apps/dashboard/src/lib/auth.ts`](apps/dashboard/src/lib/auth.ts:93)                                                                                                   | `getIsOwner()` — cek `OWNER_PHONE` config vs user phone |
| API guard   | [`analytics/route.ts`](apps/dashboard/src/app/api/analytics/route.ts:7) + [`health/route.ts`](apps/dashboard/src/app/api/health/route.ts:7)                             | `401 Forbidden` kalo bukan owner                        |
| Page guard  | [`analytics/page.tsx`](apps/dashboard/src/app/dashboard/system/analytics/page.tsx:73) + [`health/page.tsx`](apps/dashboard/src/app/dashboard/system/health/page.tsx:73) | Redirect ke `/dashboard` kalo API return 403            |
