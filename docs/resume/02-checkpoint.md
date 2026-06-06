# Checkpoint #2 — Hapus Timezone & Currency Per-User (Global Default)

**Tanggal:** 2026-06-06
**Cakupan:** Full-stack — Schema DB, AI, Worker, Dashboard, API, Migration

---

## Ringkasan Perubahan

Timezone di-hardcode ke `"Asia/Jakarta"` (WIB) dan currency ke `"IDR"` untuk semua pengguna. Kolom `timezone` dan `preferred_currency` dihapus dari `users`, dan `currency` dihapus dari `transactions`, `recurring_bills`, dan `budgets`.

Semua application code yang sebelumnya merujuk ke `user.timezone` sekarang langsung menggunakan konstanta `"Asia/Jakarta"`, dan semua `preferredCurrency`/`tx.currency` langsung menggunakan `"IDR"`.

---

## 1. Schema Changes

### Kolom Dihapus

| Tabel             | Kolom Dihapus              | File Schema                                                                                 |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `users`           | `timezone`                 | [`packages/db/src/schema/users.ts`](packages/db/src/schema/users.ts:20)                     |
| `users`           | `preferred_currency`       | [`packages/db/src/schema/users.ts`](packages/db/src/schema/users.ts:25)                     |
| `transactions`    | `currency`                 | [`packages/db/src/schema/transactions.ts`](packages/db/src/schema/transactions.ts:60)       |
| `recurring_bills` | `currency`                 | [`packages/db/src/schema/recurring-bills.ts`](packages/db/src/schema/recurring-bills.ts:28) |
| `budgets`         | `currency`                 | [`packages/db/src/schema/budgets.ts`](packages/db/src/schema/budgets.ts:30)                 |
| `reports` (type)  | `currency` di `ReportData` | [`packages/db/src/schema/reports.ts`](packages/db/src/schema/reports.ts:22)                 |

### Migration

File: [`packages/db/drizzle/0001_late_wild_pack.sql`](packages/db/drizzle/0001_late_wild_pack.sql:16)

```sql
ALTER TABLE "budgets" DROP COLUMN "currency";
ALTER TABLE "recurring_bills" DROP COLUMN "currency";
ALTER TABLE "transactions" DROP COLUMN "currency";
ALTER TABLE "users" DROP COLUMN "timezone";
ALTER TABLE "users" DROP COLUMN "preferred_currency";
```

---

## 2. AI Layer

| File                                                                                                 | Perubahan                                            |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`packages/ai/src/interfaces/index.ts`](packages/ai/src/interfaces/index.ts:11)                      | `timezone?: string` dihapus dari `ExtractionContext` |
| [`packages/ai/src/providers/sumopod.provider.ts`](packages/ai/src/providers/sumopod.provider.ts:204) | `context?.timezone` → hardcode `"Asia/Jakarta"`      |

---

## 3. Worker Processors (10 file)

| File                                                                                              | Perubahan Utama                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`settings-command.processor.ts`](apps/worker/src/processors/settings-command.processor.ts)       | Hapus `handleSetTimezone()`, `handleSetCurrency()`, `VALID_TZ_ALIASES`. Register tanpa tz/currency. `handleShowSettings` hardcode. `/atur timezone` & `/atur matauang` → info bahwa sudah fixed |
| [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts) | Hapus `getUserTimezone()`. Semua `tz` → `"Asia/Jakarta"`                                                                                                                                        |
| [`budget-command.processor.ts`](apps/worker/src/processors/budget-command.processor.ts)           | `getCurrentPeriod(timezone?)` → `getCurrentPeriod()`. Semua `user.timezone` → `"Asia/Jakarta"`                                                                                                  |
| [`budget-check.processor.ts`](apps/worker/src/processors/budget-check.processor.ts)               | `user.timezone` → `"Asia/Jakarta"`                                                                                                                                                              |
| [`budget-rollover.processor.ts`](apps/worker/src/processors/budget-rollover.processor.ts)         | `select({ timezone })` disederhanakan. Rollover tanpa `prev.currency`. Semua tz → `"Asia/Jakarta"`                                                                                              |
| [`report.processor.ts`](apps/worker/src/processors/report.processor.ts)                           | `select({ timezone })` → `select({ id })`. `getDateRange` hardcode tz                                                                                                                           |
| [`recurring-setup.processor.ts`](apps/worker/src/processors/recurring-setup.processor.ts)         | `user.timezone` → `"Asia/Jakarta"`                                                                                                                                                              |
| [`recurring-reminder.processor.ts`](apps/worker/src/processors/recurring-reminder.processor.ts)   | Hapus `userTimezone` dari select. `formatCurrency(bill.amount, "IDR")`. `computeNextReminderDate` hardcode tz                                                                                   |
| [`monthly-report.processor.ts`](apps/worker/src/processors/monthly-report.processor.ts)           | `generateForUser` type tanpa `timezone`. Hapus `currency: "IDR"` dari `ReportData`                                                                                                              |
| [`custom-command.processor.ts`](apps/worker/src/processors/custom-command.processor.ts)           | Hapus `getUserTimezone()`. Date display pake `"Asia/Jakarta"`                                                                                                                                   |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts)             | Hapus `getUserTimezone()`, `currency` dari insert. `transactionDate` pake `"Asia/Jakarta"`                                                                                                      |

---

## 4. Dashboard API Routes (6 file)

| File                                                                                        | Perubahan                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`settings/route.ts`](apps/dashboard/src/app/api/settings/route.ts)                         | Hapus `timezone` & `preferredCurrency` dari GET response, PATCH whitelist, returning            |
| [`transactions/route.ts`](apps/dashboard/src/app/api/transactions/route.ts)                 | Hapus `DEFAULT_TIMEZONE` import. Tambah local `TZ` konstanta. Hapus `currency` dari POST insert |
| [`transactions/[id]/route.ts`](apps/dashboard/src/app/api/transactions/[id]/route.ts)       | Hapus `DEFAULT_TIMEZONE`. Tambah `TZ`. Hapus `currency` dari PATCH body                         |
| [`stats/route.ts`](apps/dashboard/src/app/api/stats/route.ts)                               | Hapus `user.timezone`. Tambah `TZ`                                                              |
| [`insights/route.ts`](apps/dashboard/src/app/api/insights/route.ts)                         | Semua `.tz(tz)` → `.tz("Asia/Jakarta")`                                                         |
| [`budgets/route.ts`](apps/dashboard/src/app/api/budgets/route.ts)                           | Semua `.tz(tz)` → `.tz("Asia/Jakarta")`                                                         |
| [`recurring-bills/route.ts`](apps/dashboard/src/app/api/recurring-bills/route.ts)           | Hapus `DEFAULT_TIMEZONE`. `nextReminderAt` pake `TZ`                                            |
| [`recurring-bills/[id]/route.ts`](apps/dashboard/src/app/api/recurring-bills/[id]/route.ts) | Hapus `DEFAULT_TIMEZONE`. `tz` → `TZ`                                                           |

---

## 5. Dashboard UI Pages (4 file)

| File                                                                                                  | Perubahan                                                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`settings/page.tsx`](apps/dashboard/src/app/dashboard/settings/page.tsx)                             | Hapus `timezone`, `preferredCurrency` dari `UserProfile`. TZ & currency jadi read-only fixed |
| [`transactions/page.tsx`](apps/dashboard/src/app/dashboard/transactions/page.tsx)                     | `formatCurrency(tx.amount, "IDR")`                                                           |
| [`transactions/[id]/edit/page.tsx`](apps/dashboard/src/app/dashboard/transactions/[id]/edit/page.tsx) | `currency: "IDR"`                                                                            |
| [`page.tsx`](apps/dashboard/src/app/dashboard/page.tsx)                                               | `formatCurrency(tx.amount, "IDR")`                                                           |

---

## 6. API Webhook Service

| File                                                                        | Perubahan                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`webhook.service.ts`](apps/api/src/modules/webhook/webhook.service.ts:431) | `getGreetingReply()` tidak lagi baca `user.timezone` — panggil dengan `null`. `dayjsInTz()` tanpa argumen (fallback ke default) |

---

## 7. Analytics Helper Verification

`trackEvent()` di [`packages/db/src/index.ts`](packages/db/src/index.ts:46) sudah terimplementasi sejak checkpoint #1:

```typescript
export async function trackEvent(event: NewAnalyticsEvent): Promise<void> {
  try {
    const db = getDb();
    await db.insert(analyticsEvents).values(event);
  } catch (err) {
    console.error("[analytics] Failed to insert event:", err);
  }
}
```

**Status:** ✅ Tidak perlu perubahan.

---

## Prinsip Desain

- **DB tetap UTC** — semua `timestamp` di database tetap UTC, interpretasi waktu terjadi di application layer
- **Asia/Jakarta** — semua `dayjs().tz()` langsung menggunakan konstanta string `"Asia/Jakarta"`, tidak lagi membaca dari database
- **IDR** — semua `formatCurrency()` langsung menggunakan `"IDR"`, tidak lagi membaca dari kolom `currency`/`preferred_currency`
- **Backward compatibility** — command `/atur timezone` dan `/atur matauang` tidak dihapus, tapi membalas dengan pesan info bahwa sudah fixed
