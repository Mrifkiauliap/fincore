# Checkpoint #3 — Task 5: Polishing, Bug Fixes & Code Cleanup

**Tanggal:** 2026-06-06
**Cakupan:** Task 5 (11 sections) + Bonus fixes (health, analytics)

---

## Ringkasan Perubahan

Task 5 fokus pada hardening codebase: integrasi `trackEvent()` ke semua critical path, penghapusan `as any` casts yang berbahaya, migrasi `console.error` ke structured logger, dan konsistensi formatting.

---

## 1. `trackEvent()` Integration — All Critical Paths

`trackEvent()` di [`packages/db/src/index.ts:46`](packages/db/src/index.ts:46) sudah ada sejak checkpoint #1, tapi tidak dipanggil di mana pun. Task 5 mengintegrasikannya ke **12 processor files**:

| Processor                                                                                             | Events Tracked                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`base.processor.ts`](apps/worker/src/processors/base.processor.ts:58)                                | `job.permanently_failed` (DLQ handler)            |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:179)             | `ai.extraction.completed`, `ai.extraction.failed` |
| [`messsage.processor.ts`](apps/worker/src/processors/messsage.processor.ts:89)                        | `user.onboarded`, `message.received`              |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts:384) | `transaction.deleted`, `transaction.updated`      |
| [`confirmation.processor.ts`](apps/worker/src/processors/confirmation.processor.ts:117)               | `transaction.confirmed`                           |
| [`budget-command.processor.ts`](apps/worker/src/processors/budget-command.processor.ts:152)           | `budget.set`, `budget.deleted`                    |
| [`budget-check.processor.ts`](apps/worker/src/processors/budget-check.processor.ts:136)               | `budget.warning.sent`, `budget.alert.sent`        |
| [`monthly-report.processor.ts`](apps/worker/src/processors/monthly-report.processor.ts:269)           | `report.monthly.generated`, `report.monthly.sent` |
| [`recurring-setup.processor.ts`](apps/worker/src/processors/recurring-setup.processor.ts:119)         | `recurring.created`                               |
| [`recurring-reminder.processor.ts`](apps/worker/src/processors/recurring-reminder.processor.ts:103)   | `recurring.reminder.sent`                         |
| [`event-publishing.processor.ts`](apps/worker/src/processors/event-publishing.processor.ts:111)       | `event.published`, `event.publish.failed`         |

Semua calls menggunakan `.catch(() => {})` — fire-and-forget, tidak mengganggu main flow.

---

## 2. Fix `extracted.currency` → `"IDR"`

[`ai-extraction.processor.ts:504`](apps/worker/src/processors/ai-extraction.processor.ts:504) — `extracted.currency` yang masih dibaca dari AI output (bisa return `"USD"` dll) diganti dengan hardcode `"IDR"`:

```typescript
// Before (Task 5 checkpoint #2):
const amountStr = formatCurrency(extracted.total_amount, extracted.currency);

// After:
const amountStr = formatCurrency(extracted.total_amount, "IDR");
```

---

## 3. Remove Dangerous `as any` Casts

| File                                                                                                  | Line     | Fix                                                                  |
| ----------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts:377) | 377      | `updateFields as any` → `as typeof transactions.$inferInsert`        |
| [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts:317)           | 317      | `type as any` → `as typeof paymentMethodTypeEnum.enumValues[number]` |
| [`report.processor.ts`](apps/worker/src/processors/report.processor.ts:588)                           | 588      | `typeFilter as any` → `as "expense" \| "income" \| "transfer"`       |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:175)             | 175, 229 | `extractedList as any` — low risk (logging), kept as-is              |

---

## 4. `console.error` → Structured Logger

### New File

[`apps/dashboard/src/lib/logger.ts`](apps/dashboard/src/lib/logger.ts) — lightweight JSON-structured logger untuk production (Docker), tanpa dependency tambahan.

### Updated Routes (12 files)

Semua `console.error("GET /api/xxx error:", error)` → `logger.error({ route: "GET /api/xxx", err: String(error) }, "Request failed")`:

| Route                                                                                          | `console.error` Count |
| ---------------------------------------------------------------------------------------------- | --------------------- |
| [`transactions/route.ts`](apps/dashboard/src/app/api/transactions/route.ts:113)                | 2                     |
| [`transactions/[id]/route.ts`](apps/dashboard/src/app/api/transactions/[id]/route.ts:56)       | 3                     |
| [`stats/route.ts`](apps/dashboard/src/app/api/stats/route.ts:125)                              | 1                     |
| [`insights/route.ts`](apps/dashboard/src/app/api/insights/route.ts:301)                        | 1                     |
| [`budgets/route.ts`](apps/dashboard/src/app/api/budgets/route.ts:82)                           | 1                     |
| [`budgets/[id]/route.ts`](apps/dashboard/src/app/api/budgets/[id]/route.ts:52)                 | 1                     |
| [`recurring-bills/route.ts`](apps/dashboard/src/app/api/recurring-bills/route.ts:82)           | 1                     |
| [`recurring-bills/[id]/route.ts`](apps/dashboard/src/app/api/recurring-bills/[id]/route.ts:69) | 1                     |
| [`settings/route.ts`](apps/dashboard/src/app/api/settings/route.ts:108)                        | 1                     |
| [`categories/[id]/route.ts`](apps/dashboard/src/app/api/categories/[id]/route.ts:60)           | 1                     |
| [`payment-methods/[id]/route.ts`](apps/dashboard/src/app/api/payment-methods/[id]/route.ts:55) | 1                     |
| [`sessions/route.ts`](apps/dashboard/src/app/api/sessions/route.ts:104)                        | 1                     |

---

## 5. Hydration Mismatch Fix

[`apps/dashboard/src/app/dashboard/loading.tsx`](apps/dashboard/src/app/dashboard/loading.tsx) — `Math.random()` di style inline diganti dengan array deterministic:

```tsx
// Before:
useEffect(() => {
  setBarHeights(Array.from({ length: 6 }, () => 20 + Math.random() * 80));
}, []);

// After:
const barHeights = [45, 30, 55, 40, 60, 35]; // static, no useState/useEffect needed
```

Hapus import `useEffect` dan `useState` — component sekarang pure SSR-compatible.

---

## 6. `Intl.NumberFormat` → `formatCurrency("IDR")` Consistency

| File                                                                                                  | Instances Replaced                                                                             |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`budget-command.processor.ts`](apps/worker/src/processors/budget-command.processor.ts:147)           | 2 (set + check budget)                                                                         |
| [`budget-check.processor.ts`](apps/worker/src/processors/budget-check.processor.ts:125)               | 2 (alert + warning messages)                                                                   |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts:140) | 4 + 2 inline (delete last, delete search, pending list, edit search, pending info, edit input) |
| [`recurring-setup.processor.ts`](apps/worker/src/processors/recurring-setup.processor.ts:128)         | 1 (amount display)                                                                             |

---

## 7. Bonus: Valkey Health Check

[`apps/dashboard/src/app/api/health/route.ts`](apps/dashboard/src/app/api/health/route.ts) — ditambahkan TCP socket check ke Valkey/Redis. Parsing URL dari `VALKEY_URL` config, connect via Node.js `net` module (no `ioredis` dependency needed). 3s timeout.

Response:

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy" },
    "valkey": { "status": "healthy", "detail": "TCP port reachable" }
  }
}
```

---

## 8. Bonus: Runtime Fix — Analytics Page

[`apps/dashboard/src/app/dashboard/system/analytics/page.tsx:224`](apps/dashboard/src/app/dashboard/system/analytics/page.tsx:224) — `aiData.summary.totalCost` adalah string dari JSONB DB, fix dengan `Number()` wrap:

```tsx
// Before (crashes):
value={`$${(aiData?.summary.totalCost ?? 0).toFixed(4)}`}

// After:
value={`$${Number(aiData?.summary.totalCost ?? 0).toFixed(4)}`}
```

---

## 9. Task 6 Preparation

[`docs/task/task6.md`](docs/task/task6.md) dibuat — mencatat 3 data gap di analytics dashboard:

1. `durationMs` vs `latencyMs` key mismatch (avg latency selalu 0)
2. `model` tidak dikirim ke `trackEvent` (most used model selalu "N/A")
3. `cost` tidak dihitung (AI cost selalu $0.0000)

---

## Files Modified (24 total)

### Worker (11)

- `base.processor.ts`, `ai-extraction.processor.ts`, `messsage.processor.ts`, `transaction-command.processor.ts`, `confirmation.processor.ts`, `budget-command.processor.ts`, `budget-check.processor.ts`, `monthly-report.processor.ts`, `recurring-setup.processor.ts`, `recurring-reminder.processor.ts`, `event-publishing.processor.ts`, `custom-command.processor.ts`, `report.processor.ts`

### Dashboard (11)

- `lib/logger.ts` (new), `loading.tsx`, `analytics/page.tsx`, `health/route.ts`
- 12 API route files

### Docs (1)

- `docs/task/task6.md` (new)
