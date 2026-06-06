# Task 5: Polishing — Bug Fixes, Error Handling & Code Cleanup

**Tanggal:** 2026-06-06
**Status:** ✅ Complete — see [`docs/resume/03-checkpoint.md`](docs/resume/03-checkpoint.md) for full summary
**Prioritas:** 🔴 Tinggi (stability & correctness)
**Estimasi:** 3-4 jam

---

## Overview

Task ini fokus pada **polishing, bug fixing, dan hardening** codebase FinCore. Tidak menambah fitur baru — hanya memperbaiki yang sudah ada agar lebih robust, rapi, dan production-ready.

---

## 1. Integrasi `trackEvent()` ke Semua Critical Path

### Problem

[`trackEvent()`](packages/db/src/index.ts:46) sudah didefinisikan di `@fincore/db` tapi **tidak ada satu pun processor atau API route yang mengimpornya atau memanggilnya**. Tabel `analytics_events` sudah ada, migration sudah jalan, tapi tabel akan selalu kosong.

### Checklist

- [x] **`ai-extraction.processor.ts`**
  - Setelah AI extraction sukses → `trackEvent({ category: "ai", event: "ai.extraction.completed", metadata: { userId, durationMs, inputTokens, outputTokens } })`
  - Setelah AI extraction gagal → `trackEvent({ category: "ai", event: "ai.extraction.failed", metadata: { userId, error, durationMs } })`

- [x] **`messsage.processor.ts`**
  - User baru register → `trackEvent({ category: "user", event: "user.onboarded", userId, metadata: { phone } })`
  - Message masuk & disimpan → `trackEvent({ category: "system", event: "message.received", metadata: { type, hasMedia } })`

- [x] **`transaction-command.processor.ts`**
  - Transaksi dihapus → `trackEvent({ category: "transaction", event: "transaction.deleted", userId })`
  - Transaksi dikonfirmasi → `trackEvent({ category: "transaction", event: "transaction.confirmed", userId })`
  - Transaksi diedit → `trackEvent({ category: "transaction", event: "transaction.updated", userId })`

- [x] **`confirmation.processor.ts`**
  - Konfirmasi transaksi → `trackEvent({ category: "transaction", event: "transaction.confirmed", userId })`

- [x] **`budget-command.processor.ts`**
  - Budget diset → `trackEvent({ category: "user", event: "budget.set", userId })`
  - Budget dihapus → `trackEvent({ category: "user", event: "budget.deleted", userId })`

- [x] **`budget-check.processor.ts`**
  - Warning 80% terkirim → `trackEvent({ category: "transaction", event: "budget.warning.sent", userId })`
  - Alert 100% terkirim → `trackEvent({ category: "transaction", event: "budget.alert.sent", userId })`

- [x] **`monthly-report.processor.ts`**
  - Report digenerate → `trackEvent({ category: "system", event: "report.monthly.generated", userId })`
  - Report terkirim → `trackEvent({ category: "system", event: "report.monthly.sent", userId })`

- [x] **`recurring-setup.processor.ts`**
  - Tagihan dibuat → `trackEvent({ category: "user", event: "recurring.created", userId })`

- [x] **`recurring-reminder.processor.ts`**
  - Reminder terkirim → `trackEvent({ category: "system", event: "recurring.reminder.sent", userId })`

- [x] **`event-publishing.processor.ts`**
  - Event publish sukses → `trackEvent({ category: "queue", event: "event.published", metadata: { subscriberCount } })`
  - Event publish gagal → `trackEvent({ category: "queue", event: "event.publish.failed", metadata: { subscriberCount } })`

### Import yang perlu ditambahkan

```typescript
import { trackEvent } from "@fincore/db";
```

---

## 2. Hapus `extracted.currency` — Hardcode "IDR"

### Problem

[`ai-extraction.processor.ts` baris 506](apps/worker/src/processors/ai-extraction.processor.ts:506):

```typescript
const amountStr = formatCurrency(extracted.total_amount, extracted.currency);
```

Kolom `currency` sudah dihapus dari tabel tapi field ini masih dibaca dari output AI extraction. AI mungkin masih return `"IDR"`, `"USD"`, atau string lain — tapi kita sudah hardcode IDR di semua tempat lain.

### Fix

```typescript
const amountStr = formatCurrency(extracted.total_amount, "IDR");
```

---

## 3. Hapus Semua `as any` Cast yang Berbahaya

### Problem

`as any` bypass type safety Drizzle ORM. Kalau schema berubah, TypeScript tidak akan kasih warning.

### Lokasi

| File                                                                                                  | Baris | Cast                     | Risiko                                              |
| ----------------------------------------------------------------------------------------------------- | ----- | ------------------------ | --------------------------------------------------- |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts:377) | 377   | `updateFields as any`    | 🔴 Tinggi — melewati validasi insert/update Drizzle |
| [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts:317)           | 317   | `type as any`            | 🟡 Sedang — enum type untuk payment method          |
| [`report.processor.ts`](apps/worker/src/processors/report.processor.ts:588)                           | 588   | `typeFilter as any`      | 🟡 Sedang — filter query                            |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:175)             | 175   | `extractedList as any`   | 🟢 Rendah — hanya untuk log snapshot                |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:229)             | 229   | `extractedList as any`   | 🟢 Rendah — hanya untuk log snapshot                |
| [`messsage.processor.ts`](apps/worker/src/processors/messsage.processor.ts:174)                       | 174   | `data.rawPayload as any` | 🟢 Rendah — payload WAHA webhook                    |

### Checklist

- [x] [`transaction-command.processor.ts:377`](apps/worker/src/processors/transaction-command.processor.ts:377) — Ganti `as any` dengan properly typed update object. Bisa pakai `satisfies Partial<NewTransaction>` atau explicit type.
- [x] [`custom-command.processor.ts:317`](apps/worker/src/processors/custom-command.processor.ts:317) — Gunakan enum literal atau `typeof paymentMethodTypeEnum.enumValues[number]`
- [x] [`report.processor.ts:588`](apps/worker/src/processors/report.processor.ts:588) — Gunakan type guard atau explicit union type
- [x] Tiga `as any` untuk logging — ganti dengan `JSON.stringify()` atau biarkan (low risk)

---

## 4. Dashboard API: `console.error` → Structured Logger

### Problem

Semua API route dashboard menggunakan `console.error()` untuk logging error. Di production (Docker), ini sulit di-search dan tidak terstruktur.

### Checklist

- [x] Buat shared logger instance untuk dashboard (atau gunakan `@fincore/logger` jika kompatibel dengan Edge/Next.js)
- [x] Ganti semua `console.error("GET /api/xxx error:", error)` → `logger.error({ route: "/api/xxx", err: error }, "Request failed")`

**File yang perlu diupdate:**

| File                                                                                           | Lines             |
| ---------------------------------------------------------------------------------------------- | ----------------- |
| [`transactions/route.ts`](apps/dashboard/src/app/api/transactions/route.ts:111)                | 2 `console.error` |
| [`transactions/[id]/route.ts`](apps/dashboard/src/app/api/transactions/[id]/route.ts:185)      | 3 `console.error` |
| [`stats/route.ts`](apps/dashboard/src/app/api/stats/route.ts:123)                              | 1 `console.error` |
| [`insights/route.ts`](apps/dashboard/src/app/api/insights/route.ts:302)                        | 1 `console.error` |
| [`budgets/route.ts`](apps/dashboard/src/app/api/budgets/route.ts:83)                           | 1 `console.error` |
| [`budgets/[id]/route.ts`](apps/dashboard/src/app/api/budgets/[id]/route.ts:52)                 | 2 `console.error` |
| [`recurring-bills/route.ts`](apps/dashboard/src/app/api/recurring-bills/route.ts:80)           | 2 `console.error` |
| [`recurring-bills/[id]/route.ts`](apps/dashboard/src/app/api/recurring-bills/[id]/route.ts:68) | 2 `console.error` |
| [`settings/route.ts`](apps/dashboard/src/app/api/settings/route.ts:124)                        | 2 `console.error` |
| [`categories/[id]/route.ts`](apps/dashboard/src/app/api/categories/[id]/route.ts:60)           | 2 `console.error` |
| [`payment-methods/[id]/route.ts`](apps/dashboard/src/app/api/payment-methods/[id]/route.ts:55) | 2 `console.error` |
| [`sessions/route.ts`](apps/dashboard/src/app/api/sessions/route.ts:104)                        | 1 `console.error` |

---

## 5. Hydration Mismatch di Loading Skeleton

### Problem

[`apps/dashboard/src/app/dashboard/loading.tsx`](apps/dashboard/src/app/dashboard/loading.tsx:48) menggunakan `Math.random()` di style inline:

```tsx
style={{ height: `${20 + Math.random() * 60}%` }}
```

Ini menyebabkan React hydration mismatch error. Sudah tercatat di [`docs/vulnerability.md`](docs/vulnerability.md).

### Fix

```tsx
// Gunakan array deterministic heights berdasarkan index
const heights = [45, 30, 55, 40, 60, 35, 50, 25];
// ...
style={{ height: `${heights[i % heights.length]}%` }}
```

### Checklist

- [x] Ganti `Math.random()` dengan array heights yang deterministic

---

## 6. Worker Dead-Letter-Queue Handling

### Problem

[`base.processor.ts`](apps/worker/src/processors/base.processor.ts:57) sudah punya handler untuk job yang permanently failed, tapi hanya nge-log. Tidak ada alert atau mekanisme retry dengan backoff yang berbeda.

### Checklist

- [x] Tambahkan `trackEvent` call di failed job handler:
  ```typescript
  (job, err) => {
    this.logger.error({ jobId: job?.id, err }, "Job permanently failed");
    trackEvent({
      category: "queue",
      event: "job.permanently_failed",
      metadata: { jobId: job?.id, jobName: job?.name, error: String(err) },
    }).catch(() => {}); // fire-and-forget
  };
  ```
- [x] Tambahkan max retry attempts dan backoff di `workerOptions()` per processor yang kritis (AI extraction, event publishing)

---

## 7. `rawMessages.retryCount` Tidak Pernah Di-set

### Problem

Kolom `retryCount` ada di schema [`raw_messages`](packages/db/src/schema/raw-messages.ts) tapi tidak ada processor yang meng-increment-nya saat retry.

### Checklist

- [x] Di `ai-extraction.processor.ts`, increment `retryCount` setiap kali job retry
- [x] Di `messsage.processor.ts`, increment `retryCount` sebelum re-enqueue untuk reprocessing

---

## 8. Processor `process()` Method Tanpa Try-Catch

### Problem

Beberapa processor mengandalkan `BaseProcessor` wrapper untuk try-catch, tapi jika ada error di `process()` yang tidak di-throw (misal: return early setelah `sendWaMessage` yang gagal), error tersebut silent.

### Checklist

- [x] Audit semua processor yang memanggil `sendWaMessage()` tanpa await catching rejection
- [x] Pastikan semua `await sendWaMessage(...)` di-wrap dengan try-catch atau `.catch()`

---

## 9. Cleanup: Dead Code & Unused Imports

### Checklist

- [x] Hapus `DEFAULT_TIMEZONE` import dari file yang sudah tidak menggunakannya:
  - [`report.processor.ts`](apps/worker/src/processors/report.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - [`budget-rollover.processor.ts`](apps/worker/src/processors/budget-rollover.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - [`budget-check.processor.ts`](apps/worker/src/processors/budget-check.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - [`recurring-reminder.processor.ts`](apps/worker/src/processors/recurring-reminder.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - [`monthly-report.processor.ts`](apps/worker/src/processors/monthly-report.processor.ts) — masih import `DEFAULT_TIMEZONE`?
  - Semua dashboard API route yang sebelumnya import `DEFAULT_TIMEZONE`

- [x] Cek dan hapus import `dayjs/plugin/timezone` + `dayjs.extend(timezone)` dari file yang tidak lagi menggunakan `.tz()`

- [x] Hapus `CURRENCY_OPTIONS`, `TIMEZONE_OPTIONS`, `VALID_TZ_ALIASES` yang sudah tidak terpakai

---

## 10. Format Konsistensi: `formatCurrency` Selalu Hardcode "IDR"

### Problem

Beberapa tempat masih menggunakan `Intl.NumberFormat` langsung tanpa `formatCurrency`:

### Checklist

- [x] [`budget-command.processor.ts`](apps/worker/src/processors/budget-command.processor.ts) baris 141 & 228 — dua instance `new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" })` → ganti dengan `formatCurrency(value, "IDR")`
- [x] [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts) — 4 instance `new Intl.NumberFormat(...)` → ganti dengan `formatCurrency(value, "IDR")`
- [x] [`recurring-setup.processor.ts`](apps/worker/src/processors/recurring-setup.processor.ts) baris 122 — `new Intl.NumberFormat("id-ID")` → `formatCurrency(value, "IDR")`

---

## 11. Schema Cleanup: Raw Tables yang Tidak Dipakai

### Problem

Task #1 menyebutkan `raw-transcriptions.ts` dan `raw-ocr-results.ts` tapi kedua file tersebut **tidak ada di codebase**. Data transkripsi dan OCR disimpan langsung di `ai_processing_logs`.

### Checklist

- [x] Verifikasi bahwa `raw-transcriptions` dan `raw-ocr-results` memang tidak ada di codebase → ✅ confirmed
- [x] Tidak ada action diperlukan — desain sudah benar. Cukup verifikasi.

---

## Prioritas Eksekusi

| #   | Item                                   | Prioritas | Risiko kalau tidak dikerjakan            | Status |
| --- | -------------------------------------- | --------- | ---------------------------------------- | ------ |
| 1   | `trackEvent` integrasi                 | 🔴 Tinggi | Analytics kosong — tidak bisa monitoring | ✅     |
| 2   | `extracted.currency` → "IDR"           | 🔴 Tinggi | Bisa format salah (USD, etc)             | ✅     |
| 3   | Hapus `as any` casts                   | 🟡 Sedang | Type safety bolong                       | ✅     |
| 4   | `console.error` → logger               | 🟡 Sedang | Debug production sulit                   | ✅     |
| 5   | Hydration mismatch                     | 🟢 Rendah | Warning di console                       | ✅     |
| 6   | DLQ handling                           | 🟡 Sedang | Job failure silent                       | ✅     |
| 7   | `retryCount` tracking                  | 🟢 Rendah | Tidak urgent                             | ✅     |
| 8   | Try-catch `sendWaMessage`              | 🟡 Sedang | Unhandled rejection                      | ✅     |
| 9   | Cleanup unused imports                 | 🟢 Rendah | Warning di IDE                           | ✅     |
| 10  | `Intl.NumberFormat` → `formatCurrency` | 🟢 Rendah | Konsistensi kode                         | ✅     |
| 11  | Schema cleanup                         | ✅ N/A    | Sudah verified                           | ✅     |
