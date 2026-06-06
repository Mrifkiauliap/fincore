# Checkpoint #5 — Task 7: "New Era" — Restructuring apps/api & apps/worker

**Tanggal:** 2026-06-06
**Cakupan:** Task 7 (3 phases, 19 items) — Restructuring + hardening backend apps

---

## Ringkasan Perubahan

Task 7 fokus pada restructuring dan hardening [`apps/api`](apps/api) dan [`apps/worker`](apps/worker) — memperbaiki struktur, konsistensi, bug tersembunyi, dan unoptimal patterns tanpa menambah fitur baru.

---

## Phase 1 — Critical Bug Fixes (5 items)

### A1. `OwnerOnlyGuard` Dipasang di Webhook Controller 🔴

[`webhook.controller.ts:31`](apps/api/src/modules/webhook/webhook.controller.ts:31) — `@UseGuards(WebhookSignatureGuard, OwnerOnlyGuard)`.

Sebelumnya hanya `WebhookSignatureGuard`. Semua user bisa trigger webhook. Sekarang `OwnerOnlyGuard` memfilter sender WhatsApp yang tidak terdaftar.

### C2. `sendWaMessage` + `sendWaImage` Self-Catching 🔴

[`packages/queue/src/index.ts:97-135`](packages/queue/src/index.ts:97) — Kedua fungsi sekarang di-wrap dengan `try/catch` internal. Semua 99 call sites otomatis aman dari unhandled rejection. Plus `safeReply()` fire-and-forget wrapper untuk kenyamanan.

### B1. Shared Valkey Connection Singleton 🔴

[`packages/queue/src/index.ts:10-48`](packages/queue/src/index.ts:10) — `getSharedValkey()` singleton + `closeSharedValkey()` untuk graceful shutdown.

[`base.processor.ts:5,31`](apps/worker/src/processors/base.processor.ts:5) — Semua 15 worker processors sekarang pakai shared connection (sebelumnya `createValkeyConnection()` dipanggil 12+ kali = 12 koneksi pool terpisah).

[`webhook.service.ts:28`](apps/api/src/modules/webhook/webhook.service.ts:28) — Webhook service juga pakai shared Valkey.

### A3. Dynamic Import di AuthService Diresolve 🟡

[`auth.service.ts:48`](apps/api/src/modules/auth/auth.service.ts:48) — `const { sendWaMessage } = await import("@fincore/queue")` diganti dengan static `import { sendWaMessage }`. Tidak ada lagi dynamic import anti-pattern.

### C4. Graceful Shutdown Hooks 🔴

[`api/main.ts:24`](apps/api/src/main.ts:24), [`worker/main.ts:20`](apps/worker/src/main.ts:20), [`sender/main.ts:18`](apps/sender/src/main.ts:18) — `app.enableShutdownHooks()` di ketiga app mencegah data corruption saat container di-stop.

---

## Phase 2 — Cleanup (6 items)

### A2. Logger Consistency 🟢

[`webhook.controller.ts:16`](apps/api/src/modules/webhook/webhook.controller.ts:16) — `new Logger(WebhookController.name)` → `createLogger("webhook:controller")`.

### A5. Dead Comments Dihapus 🟢

[`app.module.ts`](apps/api/src/app.module.ts) — `// TransactionModule, // ReportModule, // AuthModule` dihapus.

### B3. Typo Rename 🟢

`messsage.processor.ts` → `message.processor.ts`. Import di [`worker.module.ts:9`](apps/worker/src/worker.module.ts:9) diupdate.

### B4. Import Placement Fix 🟢

[`voice-transcription.processor.ts:7`](apps/worker/src/processors/voice-transcription.processor.ts:7) — `import { StorageProvider }` dipindahkan dari tengah file (line 25) ke atas.

### B7. Shared Job Data Types 🟡

[`packages/contracts/src/index.ts:189-250`](packages/contracts/src/index.ts:189) — `CommandJobData`, `BudgetCheckJobData`, `PendingActionState`, `IncomingMessageJobData` diekstrak ke `@fincore/contracts`.

### B8 & B9 🟢

`*.tsbuildinfo` sudah ada di [`.gitignore:33`](.gitignore:33). Semua 10 file yang import `dayjs/plugin/timezone` masih aktif menggunakan `.tz()` — tidak ada yang perlu dihapus.

---

## Phase 3 — Restructuring (6 items)

### A4. Command Router Service 🟡

**New:** [`apps/api/src/modules/webhook/command-router.service.ts`](apps/api/src/modules/webhook/command-router.service.ts) — 150+ lines command routing diekstrak dari `webhook.service.ts`. `WebhookService` sekarang ~265 lines (dari 460).

Routing mencakup: `/daftar`, `/dashboard`/`/login`, `/budget`, `/hapus`/`/konfirmasi`/`/ubah`, `/tambah`/`/lihat`/`/cari`/`/me`/`/payment`/`/category`, `/atur`/`/settings`, `/laporan harian|mingguan|bulanan`, `/summary`, `/bantuan`, `/catat`.

### B5. Custom-Command Processor Dipecah 🟡

```
processors/custom-command/
  ├── custom-add.processor.ts    — /tambah metode, /tambah kategori
  ├── custom-list.processor.ts   — /lihat metode, /lihat kategori
  └── custom-search.processor.ts — /cari, /cari #tag
```

[`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts) — sekarang hanya 106 lines (dari 519), pure orchestrator.

### A6. Global ValidationPipe 🟡

[`api/main.ts:25-31`](apps/api/src/main.ts:25) — `ValidationPipe({ transform: true, whitelist: true })` menolak malformed payload di boundary.

### C1. Command Routing Centralized 🟡

Routing command (prefix → queue) sekarang **hanya di API** (`command-router.service.ts`). Worker hanya memproses — tidak ada lagi duplicate routing di [`transaction-command.processor.ts:82`](apps/worker/src/processors/transaction-command.processor.ts:82) (itu adalah sub-command dispatch yang legitimate).

### B6. Scheduler Cleanup 🟢

[`scheduler.service.ts`](apps/worker/src/scheduler.service.ts) — Repeatable jobs di-loop dengan per-job try/catch. Lebih clean dan extensible.

### C3. Health Check Endpoint 🟡

**New:** [`apps/api/src/health/health.controller.ts`](apps/api/src/health/health.controller.ts) — `GET /health` returns `{ status, ts, valkey }`. Terdaftar di [`app.module.ts`](apps/api/src/app.module.ts).

---

## Files Modified

| File                                                                                                                | Change                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/queue/src/index.ts`](packages/queue/src/index.ts)                                                        | +`getSharedValkey()`, `closeSharedValkey()`, `safeReply()`, self-catching `sendWaMessage`/`sendWaImage`, `getQueue` uses shared connection |
| [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts)                                                | +`CommandJobData`, `BudgetCheckJobData`, `PendingActionState`, `IncomingMessageJobData`                                                    |
| [`webhook.controller.ts`](apps/api/src/modules/webhook/webhook.controller.ts)                                       | +OwnerOnlyGuard, `new Logger` → `createLogger`                                                                                             |
| [`webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts)                                             | Delegate routing ke CommandRouterService, shared Valkey, ~265 lines                                                                        |
| [`command-router.service.ts`](apps/api/src/modules/webhook/command-router.service.ts)                               | **New** — extracted command routing                                                                                                        |
| [`webhook.module.ts`](apps/api/src/modules/webhook/webhook.module.ts)                                               | +CommandRouterService provider                                                                                                             |
| [`auth.service.ts`](apps/api/src/modules/auth/auth.service.ts)                                                      | Dynamic import → static `sendWaMessage`                                                                                                    |
| [`app.module.ts`](apps/api/src/app.module.ts)                                                                       | -Dead comments, +HealthController                                                                                                          |
| [`main.ts`](apps/api/src/main.ts)                                                                                   | +ValidationPipe, +enableShutdownHooks                                                                                                      |
| [`main.ts`](apps/worker/src/main.ts)                                                                                | +enableShutdownHooks                                                                                                                       |
| [`main.ts`](apps/sender/src/main.ts)                                                                                | +enableShutdownHooks                                                                                                                       |
| [`wa-send.processor.ts`](apps/sender/src/modules/wa-send/wa-send.processor.ts)                                      | `createValkeyConnection` → `getSharedValkey`                                                                                               |
| [`sender.module.ts`](apps/sender/src/sender.module.ts)                                                              | -Dead comments                                                                                                                             |
| [`base.processor.ts`](apps/worker/src/processors/base.processor.ts)                                                 | `createValkeyConnection` → `getSharedValkey`                                                                                               |
| [`worker.module.ts`](apps/worker/src/worker.module.ts)                                                              | Import fix: `messsage` → `message`                                                                                                         |
| [`voice-transcription.processor.ts`](apps/worker/src/processors/voice-transcription.processor.ts)                   | Import `StorageProvider` moved to top                                                                                                      |
| [`scheduler.service.ts`](apps/worker/src/scheduler.service.ts)                                                      | Per-job try/catch loop                                                                                                                     |
| [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts)                             | Orchestrator only, delegates to sub-modules                                                                                                |
| [`custom-command/custom-add.processor.ts`](apps/worker/src/processors/custom-command/custom-add.processor.ts)       | **New** — /tambah commands                                                                                                                 |
| [`custom-command/custom-list.processor.ts`](apps/worker/src/processors/custom-command/custom-list.processor.ts)     | **New** — /lihat commands                                                                                                                  |
| [`custom-command/custom-search.processor.ts`](apps/worker/src/processors/custom-command/custom-search.processor.ts) | **New** — /cari commands                                                                                                                   |
| [`health.controller.ts`](apps/api/src/health/health.controller.ts)                                                  | **New** — GET /health                                                                                                                      |
| **Rename:** `messsage.processor.ts` → `message.processor.ts`                                                        | Typo fix                                                                                                                                   |

---

## Architecture: Before vs After

### Valkey Connections

```
Before:  createValkeyConnection() × 12+ = 12 pool terpisah
After:   getSharedValkey() × 1 = 1 shared pool
```

### Command Routing

```
Before:
  API: webhook.service.ts (150 lines if/else)
  API: auth.service.ts (dynamic import anti-pattern)

After:
  API: command-router.service.ts (single source of truth)
  API: auth.service.ts (static sendWaMessage)
  Worker: pure processing only
```

### Custom Command Processor

```
Before: custom-command.processor.ts (519 lines monolith)
After:
  custom-command/custom-add.processor.ts    (~170 lines)
  custom-command/custom-list.processor.ts   (~130 lines)
  custom-command/custom-search.processor.ts (~135 lines)
  custom-command.processor.ts              (~106 lines orchestrator)
```

---

## Task 7 Status Update

[`docs/task/task7.md`](docs/task/task7.md) — semua 19 checklist items selesai. Status: ✅ Complete.
