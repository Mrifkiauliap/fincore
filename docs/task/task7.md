# Task 7: "New Era" — Restructuring `apps/api` & `apps/worker`

**Tanggal:** 2026-06-06
**Prioritas:** 🔴 Tinggi (stability, security, maintainability)
**Estimasi:** 5-7 jam
**Status:** ✅ Complete

---

## Overview

Task ini fokus pada **restructuring dan hardening** dua app backend utama — `apps/api` (NestJS Fastify) dan `apps/worker` (NestJS + BullMQ). Tidak menambah fitur baru, tapi memperbaiki struktur, konsistensi, bug tersembunyi, dan unoptimal patterns yang terakumulasi dari iterasi sebelumnya.

Nama kode: **"New Era"** 😎

---

## Part A: `apps/api` — Restructuring

### A1. 🚨 CRITICAL: `OwnerOnlyGuard` Tidak Dipakai!

**File:** [`webhook.controller.ts`](apps/api/src/modules/webhook/webhook.controller.ts:30)

Controller hanya pakai `@UseGuards(WebhookSignatureGuard)` — **tidak ada `OwnerOnlyGuard`**. Semua user, terdaftar atau tidak, bisa trigger webhook. Guard sudah dibuat di [`owner.guard.ts`](apps/api/src/common/guards/owner.guard.ts) tapi tidak pernah di-attach.

**Fix:**

```typescript
@UseGuards(WebhookSignatureGuard, OwnerOnlyGuard)
```

**Impact:** 🔴 Security — unauthorized users can interact with FinCore.

### A2. Inconsistent Logger: `new Logger()` vs `createLogger()`

**File:** [`webhook.controller.ts`](apps/api/src/modules/webhook/webhook.controller.ts:16)

Controller pakai NestJS built-in `new Logger(WebhookController.name)` — tidak terstruktur. Semua file lain (guards, service, worker) pakai `createLogger()` dari `@fincore/logger`.

**Fix:** Ganti ke `createLogger("webhook:controller")`.

### A3. Dynamic Import Code Smell di `AuthService`

**File:** [`auth.service.ts:48`](apps/api/src/modules/auth/auth.service.ts:48)

```typescript
const { sendWaMessage } = await import("@fincore/queue");
```

Dynamic import digunakan sebagai workaround circular dependency (`@fincore/queue` → `@fincore/db` → back). Ini code smell — harus di-resolve dengan proper module structure atau lazy provider.

**Fix options:**

- Extract `sendWaMessage` ke package terpisah (`@fincore/wa-sender`?)
- Atau gunakan NestJS `LazyModuleLoader` / `forwardRef`

### A4. `webhook.service.ts` Terlalu Gemuk — 460 Lines

**File:** [`webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts)

Satu method `handleIncoming()` menangani semuanya: parsing, prefix check, command routing (~150 lines if/else), guardrail, message enqueue, ack. Harus dipecah.

**Proposed split:**

```
modules/webhook/
  ├── webhook.controller.ts
  ├── webhook.module.ts
  ├── webhook.service.ts         ← flow utama (tipis)
  ├── command-router.service.ts  ← routing command (extract dari service)
  ├── waha-payload.dto.ts
  └── webhook.constants.ts       ← greeting, ack messages
```

### A5. Dead Comments di `AppModule`

**File:** [`app.module.ts:10-12`](apps/api/src/app.module.ts:10)

```typescript
// TransactionModule,
// ReportModule,
// AuthModule,
```

Hapus commented-out code. Module-module ini tidak pernah ada dan tidak akan dibuat (logic ada di worker).

### A6. Tidak Ada Global Validation Pipe

Tidak ada `ValidationPipe` di `main.ts`. `WahaWebhookPayload` hanya TypeScript interface — tidak ada runtime validation sama sekali. Malformed payload bisa crash.

**Fix:** Tambahkan `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))` + ubah DTO ke class dengan decorators, atau gunakan Zod.

### A7. `FinanceGuardrail` & `createValkeyConnection()` Instantiated di Class Field

**File:** [`webhook.service.ts:21-23`](apps/api/src/modules/webhook/webhook.service.ts:21)

```typescript
private readonly guardrail = new FinanceGuardrail();
private readonly valkey = createValkeyConnection();
```

Ini di-instantiate saat module load, bukan via DI. Sulit di-test dan tidak konsisten dengan NestJS pattern.

**Fix:** Pindahkan ke constructor dengan `@Injectable()` provider, atau gunakan `onModuleInit`.

---

## Part B: `apps/worker` — Restructuring

### B1. `createValkeyConnection()` Dipanggil 12 Kali — Boros Koneksi

Setiap processor yang butuh Valkey membuat koneksi baru via `createValkeyConnection()`. Total 12+ koneksi pool terpisah:

| File                               | Lokasi                                    |
| ---------------------------------- | ----------------------------------------- |
| `base.processor.ts`                | `workerOptions()` — 1 per processor (15x) |
| `ai-extraction.processor.ts`       | class field                               |
| `transaction-command.processor.ts` | class field                               |
| `confirmation.processor.ts`        | constructor                               |
| `recurring-reminder.processor.ts`  | `process()` method                        |
| `webhook.service.ts` (api)         | class field                               |

**Fix:** Buat NestJS provider singleton `ValkeyService` / gunakan shared connection dari `@fincore/queue`.

### B2. `getDb()` Tidak Konsisten — Class Field vs Method Call

**7 processors** simpan `private readonly db = getDb()` di class field (dipanggil saat import/construction).
**8 processors** panggil `const db = getDb()` di dalam `process()`.

| Pattern                           | Processors                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `private readonly db = getDb()`   | transaction-command, custom-command, budget-command, budget-check, budget-rollover, monthly-report, settings-command                 |
| `const db = getDb()` in process() | ai-extraction, messsage, voice-transcription, image-ocr, confirmation, event-publishing, recurring-setup, recurring-reminder, report |

Keduanya berfungsi karena `getDb()` return singleton, tapi **tidak konsisten** dan class-field approach berarti koneksi dibuat saat module import (sebelum app ready).

**Fix:** Gunakan NestJS DI dengan `DRIZZLE` token (seperti di API), atau pindahkan semua ke `process()`-time.

### B3. Typo Nama File: `messsage.processor.ts`

**File:** [`messsage.processor.ts`](apps/worker/src/processors/messsage.processor.ts) — "messsage" punya 3 's'.

**Fix:** Rename ke `message.processor.ts`.

### B4. Import di Tengah File — `voice-transcription.processor.ts`

**File:** [`voice-transcription.processor.ts:25`](apps/worker/src/processors/voice-transcription.processor.ts:25)

```typescript
import { StorageProvider } from "@fincore/storage"; // ← di tengah file!
```

Ini harus di atas bersama import lainnya.

### B5. Processors Terlalu Besar — Butuh Dipecah

| File                                                                                              | Lines | Masalah                                                                           |
| ------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts)             | ~819  | Extraction + tag matching + confirmation + saving — terlalu banyak tanggung jawab |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts) | ~566  | Delete + confirm + edit + pending actions — 4 domain dalam 1 file                 |
| [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts)           | ~519  | /tambah, /lihat, /cari — kategori, metode, tag                                    |
| [`webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts)                           | ~460  | Flow + routing + guardrail — 3 tanggung jawab                                     |

**Proposed split:**

```
processors/
  ├── ai/
  │   ├── ai-extraction.processor.ts   (tipis: orchestrate only)
  │   ├── ai-tag-matcher.ts            (tag matching logic)
  │   └── ai-confirmation.ts           (confirmation flow)
  ├── transaction/
  │   ├── transaction-delete.ts
  │   ├── transaction-edit.ts
  │   └── transaction-confirm.ts
  ├── custom/
  │   ├── custom-add.processor.ts
  │   ├── custom-list.processor.ts
  │   └── custom-search.processor.ts
  └── ...
```

### B6. Scheduler Register Repeatable Jobs Tanpa Cleanup

**File:** [`scheduler.service.ts`](apps/worker/src/scheduler.service.ts)

`enqueue()` dengan `repeat` option dipanggil setiap restart tanpa cek apakah jobId sudah terdaftar. BullMQ secara internal tidak duplikasi kalau jobId sama, tapi ini tetap tidak clean — sebaiknya di-wrap dengan try-catch + log warning jika sudah ada.

### B7. No Shared Job Data Types

API (`webhook.service.ts`) dan Worker (`processors/*`) mendefinisikan job data shape masing-masing. Contoh: `IncomingMessageJobData` di worker tapi webhook service di API kirim data dengan shape yang sama tanpa shared type.

**Fix:** Pindahkan job data interfaces ke `@fincore/contracts` atau `@fincore/shared`.

### B8. File `tsconfig.tsbuildinfo` di Version Control

Kedua app punya `tsconfig.tsbuildinfo` yang berisi absolute paths ke sistem lokal developer. Ini harus di `.gitignore`.

### B9. `custom-command.processor.ts` Masih Import `dayjs/plugin/timezone`

**File:** [`custom-command.processor.ts:18-23`](apps/worker/src/processors/custom-command.processor.ts:18)

Setelah Task 2 (hapus timezone per-user), beberapa processor masih import plugin timezone yang tidak terpakai. Task 5 section 9 sudah membersihkan sebagian, tapi perlu audit ulang.

---

## Part C: Cross-Cutting Concerns

### C1. Duplicate Command Routing Logic

Routing command (prefix matching → queue name) ada di DUA tempat:

1. [`webhook.service.ts:149-312`](apps/api/src/modules/webhook/webhook.service.ts:149) — API side, sebelum enqueue
2. [`transaction-command.processor.ts:82-118`](apps/worker/src/processors/transaction-command.processor.ts:82) — Worker side, setelah enqueue

Ini berarti command bisa di-route dua kali. Seharusnya routing hanya di satu tempat.

**Fix:** Routing di API saja, worker cukup proses. Atau sebaliknya.

### C2. Error Handling Gap: `sendWaMessage` Tanpa Try-Catch

Banyak tempat panggil `sendWaMessage()` tanpa `.catch()` — jika WhatsApp API down, unhandled promise rejection bisa crash worker (tergantung Node version).

```typescript
// Contoh di transaction-command.processor.ts:65
return sendWaMessage(chatId, "Pengguna tidak ditemukan...");
// ↑ No .catch() — jika gagal, promise reject tidak tertangkap
```

**Fix:** Wrap semua `sendWaMessage` call dengan `.catch()` atau buat wrapper `safeReply()`.

### C3. Tidak Ada Health Check Endpoint di API

[`health/route.ts`](apps/dashboard/src/app/api/health/route.ts) hanya ada di **dashboard**, bukan di API. Worker juga tidak punya health check.

**Fix:** Tambahkan `GET /health` di API + health check internal di worker.

### C4. Tidak Ada Graceful Shutdown

Kedua app tidak implement `enableShutdownHooks()`. Kalau container di-stop, job yang sedang diproses bisa corrupt.

```typescript
// main.ts
app.enableShutdownHooks();
```

---

## Prioritized Checklist

### Phase 1 — Bug Fixes (🔴 Critical)

- [ ] **A1.** Pasang `OwnerOnlyGuard` di webhook controller
- [ ] **C2.** Wrap semua `sendWaMessage` dengan safe wrapper
- [ ] **B1.** Buat shared Valkey connection singleton
- [ ] **A3.** Resolve dynamic import di AuthService
- [ ] **C4.** Tambahkan `enableShutdownHooks()` di kedua app

### Phase 2 — Cleanup (🟡 Medium)

- [ ] **A2.** Ganti `new Logger()` → `createLogger()` di controller
- [ ] **A5.** Hapus commented-out module imports
- [ ] **B3.** Rename `messsage.processor.ts` → `message.processor.ts`
- [ ] **B4.** Pindahkan import `StorageProvider` ke atas
- [ ] **B7.** Extract shared job data types ke `@fincore/contracts`
- [ ] **B8.** Add `tsconfig.tsbuildinfo` ke `.gitignore`
- [ ] **B2.** Standarisasi `getDb()` — semua via DI atau semua via method call
- [ ] **B9.** Audit + hapus import `dayjs/plugin/timezone` yang tidak terpakai

### Phase 3 — Restructuring (🟢 Improvement)

- [ ] **A4.** Pecah `webhook.service.ts` — extract command router
- [ ] **B5.** Pecah 3 processor terbesar (ai-extraction, transaction-command, custom-command)
- [ ] **A6.** Tambahkan `ValidationPipe` global + Zod DTO
- [ ] **C1.** Centralize command routing (single source of truth)
- [ ] **A7.** Pindahkan `FinanceGuardrail` + Valkey ke DI
- [ ] **B6.** Clean up scheduler repeatable job registration
- [ ] **C3.** Tambahkan health check endpoint di API + Worker

---

## Files to Modify

| File                                                                                              | Change                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`webhook.controller.ts`](apps/api/src/modules/webhook/webhook.controller.ts)                     | Add `OwnerOnlyGuard`, fix logger       |
| [`auth.service.ts`](apps/api/src/modules/auth/auth.service.ts)                                    | Resolve dynamic import                 |
| [`webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts)                           | Split into smaller services            |
| [`app.module.ts`](apps/api/src/app.module.ts)                                                     | Remove dead comments                   |
| [`main.ts`](apps/api/src/main.ts)                                                                 | Add ValidationPipe, shutdown hooks     |
| [`main.ts`](apps/worker/src/main.ts)                                                              | Add shutdown hooks                     |
| [`base.processor.ts`](apps/worker/src/processors/base.processor.ts)                               | Shared Valkey connection               |
| **Rename:** `messsage.processor.ts` → `message.processor.ts`                                      | Fix typo                               |
| [`voice-transcription.processor.ts`](apps/worker/src/processors/voice-transcription.processor.ts) | Move import to top                     |
| All processors                                                                                    | Standardize `getDb()` pattern          |
| All processors                                                                                    | Wrap `sendWaMessage` with safe wrapper |
| `packages/contracts/src/index.ts`                                                                 | Add shared job data types              |
| `.gitignore`                                                                                      | Add `tsconfig.tsbuildinfo`             |
| **New:** `apps/api/src/modules/webhook/command-router.service.ts`                                 | Extract routing                        |
| **New:** `apps/api/src/health/health.controller.ts`                                               | Health endpoint                        |
| **New:** `apps/worker/src/lib/safe-reply.ts`                                                      | Safe `sendWaMessage` wrapper           |

---

## Prioritas Eksekusi

| #   | Item                         | Phase | Effort | Impact              |
| --- | ---------------------------- | ----- | ------ | ------------------- |
| 1   | Pasang `OwnerOnlyGuard`      | 1     | 5 min  | 🔴 Security fix     |
| 2   | Safe `sendWaMessage` wrapper | 1     | 30 min | 🔴 Crash prevention |
| 3   | Shared Valkey connection     | 1     | 30 min | 🔴 Resource leak    |
| 4   | Resolve dynamic import       | 1     | 30 min | 🟡 Code smell       |
| 5   | Enable shutdown hooks        | 1     | 10 min | 🔴 Data integrity   |
| 6   | Logger consistency           | 2     | 5 min  | 🟢 Consistency      |
| 7   | Dead code cleanup            | 2     | 5 min  | 🟢 Cleanliness      |
| 8   | Rename typo file             | 2     | 2 min  | 🟢 Professionalism  |
| 9   | Fix import placement         | 2     | 1 min  | 🟢 Cleanliness      |
| 10  | Shared job data types        | 2     | 30 min | 🟡 Type safety      |
| 11  | Gitignore tsbuildinfo        | 2     | 2 min  | 🟢 Hygiene          |
| 12  | Standardize getDb()          | 2     | 20 min | 🟡 Consistency      |
| 13  | Audit dayjs imports          | 2     | 15 min | 🟢 Cleanup          |
| 14  | Split webhook.service.ts     | 3     | 1.5 hr | 🟡 Maintainability  |
| 15  | Split large processors       | 3     | 3 hr   | 🟡 Maintainability  |
| 16  | Global ValidationPipe        | 3     | 30 min | 🟡 Security         |
| 17  | Centralize command routing   | 3     | 1 hr   | 🟡 DRY              |
| 18  | DI for guardrail/valkey      | 3     | 30 min | 🟢 Testability      |
| 19  | Health check endpoints       | 3     | 20 min | 🟡 Observability    |
