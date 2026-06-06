# Task 8: Split All Large Processors Into Folders

**Tanggal:** 2026-06-06
**Prioritas:** 🟡 Medium (maintainability)
**Estimasi:** 4-5 jam
**Status:** ✅ Complete
**Prerequisite:** Task 7 (checkpoint #5)

---

## Overview

Melanjutkan B5 dari Task 7 — semua processor >200 lines dipecah ke folder masing-masing. `custom-command` sudah dipecah di Task 7, `webhook.service.ts` sudah dipecah.

| #   | File                                                                                              | Lines   | Domain                                                            |
| --- | ------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| A   | [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts)             | **736** | AI extraction + tags + payment + category + confirmation + saving |
| B   | [`report.processor.ts`](apps/worker/src/processors/report.processor.ts)                           | **733** | AI parsing + 7 report builders + chart generation                 |
| C   | [`transaction-command.processor.ts`](apps/worker/src/processors/transaction-command.processor.ts) | **494** | Delete + confirm + edit + pending action state machine            |
| D   | [`budget-command.processor.ts`](apps/worker/src/processors/budget-command.processor.ts)           | **297** | Budget set/cek/hapus + spending calculation                       |
| E   | [`monthly-report.processor.ts`](apps/worker/src/processors/monthly-report.processor.ts)           | **294** | Monthly aggregation + comparison + WA message                     |
| F   | [`image-ocr.processor.ts`](apps/worker/src/processors/image-ocr.processor.ts)                     | **254** | OCR via Gemini Vision + guardrail + enqueue                       |
| G   | [`message.processor.ts`](apps/worker/src/processors/message.processor.ts)                         | **240** | Incoming message routing + welcome message                        |

Processor ≤221 lines (confirmation, settings-command, recurring-setup, voice-transcription, budget-check, event-publishing, recurring-reminder, budget-rollover) — dibiarkan utuh.

---

## Shared Rules (All Parts)

1. **No logic changes** — pure extraction, identical behavior
2. **`getDb()`** — call inside each exported function
3. **`@fincore/queue`** — use `getSharedValkey()` (not `createValkeyConnection`), `sendWaMessage` (already self-catching)
4. **Type imports** — job data interfaces already in `@fincore/contracts`
5. **Folders already created** — `processors/ai/`, `processors/transaction/` exist from Task 7. Need: `processors/report/`, `processors/budget/`, `processors/monthly/`, `processors/ocr/`, `processors/incoming/`

---

## Part A: `ai-extraction.processor.ts` → `processors/ai/`

### Method Boundaries

| Method                          | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `process()`                     | Main flow: AI call, loop, save, reply |
| `resolveCategory()`             | Match/sluggify category name          |
| `resolveTags()`                 | Match or auto-create tags             |
| `resolvePaymentMethod()`        | Fuzzy match + AI disambiguation       |
| `buildTransactionSummaryLine()` | Format one-line summary               |
| `getExtractionErrorReply()`     | Error reply text                      |
| `handleExtractionFailure()`     | Update DB + send error reply          |

### Proposed Split

```
processors/ai/
  ├── ai-extraction.processor.ts   (orchestrator, ~200 lines)
  ├── ai-resolvers.ts              (resolveCategory, resolveTags, resolvePaymentMethod)
  ├── ai-confirmation.ts           (buildSummaryLine, reply formatting, error reply)
  └── ai-saver.ts                  (DB insert: transaction, tags, events, budget check)
```

### Checklist

- [ ] Baca full `ai-extraction.processor.ts`
- [ ] Extract resolvers → `ai-resolvers.ts`
- [ ] Extract confirmation + reply → `ai-confirmation.ts`
- [ ] Extract DB insert + tag mapping + event + budget → `ai-saver.ts`
- [ ] Rewrite `process()` to delegate
- [ ] Verify `getSharedValkey()` used

---

## Part B: `report.processor.ts` → `processors/report/`

### Method Boundaries

| Method                         | Purpose                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `parseQueryWithAI()`           | AI parses "laporan minggu ini" → structured query                                  |
| `process()`                    | Parse → date range → build → send                                                  |
| `buildReport()`                | Switch: summary/balance/top_expenses/top_income/by_category/by_payment/by_merchant |
| `buildSummaryReport()`         | AI-driven summary with chart URL                                                   |
| `buildBalanceReport()`         | Income - expense = balance                                                         |
| `buildTopExpensesReport()`     | Top 5 expenses                                                                     |
| `buildTopIncomeReport()`       | Top 5 income                                                                       |
| `buildByCategoryReport()`      | Grouped by category                                                                |
| `buildByPaymentMethodReport()` | Grouped by payment method                                                          |
| `buildByMerchantReport()`      | Top 5 merchants                                                                    |
| `generateChartUrl()`           | QuickChart.io URL generation                                                       |

### Proposed Split

```
processors/report/
  ├── report.processor.ts          (orchestrator + parseQueryWithAI, ~100 lines)
  ├── report-builders.ts           (all 7 build* methods, ~400 lines)
  ├── report-chart.ts              (generateChartUrl, ~80 lines)
  └── report-summary.ts            (buildSummaryReport — AI-driven, ~150 lines)
```

### Checklist

- [ ] Baca full `report.processor.ts`
- [ ] Extract chart generation → `report-chart.ts`
- [ ] Extract buildSummaryReport → `report-summary.ts`
- [ ] Extract remaining 6 builders → `report-builders.ts`
- [ ] Rewrite orchestrator to delegate

---

## Part C: `transaction-command.processor.ts` → `processors/transaction/`

### Method Boundaries

| Method                             | Purpose                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `process()`                        | Parse command, delegate                                                  |
| `handleDeleteLast()`               | Delete last tx → Valkey state                                            |
| `handleDeleteSearch()`             | Search tx candidates → Valkey state                                      |
| `handleListPendingConfirmations()` | List unconfirmed → Valkey state                                          |
| `handleEditSearch()`               | Search tx for edit → Valkey state                                        |
| `handleEditInput()`                | Parse new amount/name, update DB                                         |
| `handlePendingAction()`            | State machine: confirm_delete, select_candidate, ubah_select, ubah_input |

### Proposed Split

```
processors/transaction/
  ├── transaction-command.processor.ts  (orchestrator + parse, ~100 lines)
  ├── transaction-delete.ts             (handleDeleteLast, handleDeleteSearch)
  ├── transaction-confirm.ts            (handleListPendingConfirmations)
  ├── transaction-edit.ts               (handleEditSearch, handleEditInput)
  └── transaction-pending.ts            (handlePendingAction state machine)
```

### Checklist

- [ ] Baca full `transaction-command.processor.ts`
- [ ] Extract delete handlers → `transaction-delete.ts`
- [ ] Extract confirm handler → `transaction-confirm.ts`
- [ ] Extract edit handlers → `transaction-edit.ts`
- [ ] Extract pending action state machine → `transaction-pending.ts`
- [ ] Rewrite `process()` to delegate
- [ ] Verify `getSharedValkey()` used

---

## Part D: `budget-command.processor.ts` → `processors/budget/`

### Method Boundaries

| Method               | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `process()`          | Parse sub-command, delegate                        |
| `handleSet()`        | `/budget set [kategori] [nominal]` — upsert budget |
| `handleCek()`        | `/budget cek` — list budgets with spending         |
| `handleHapus()`      | `/budget hapus [kategori]` — deactivate budget     |
| `getCurrentPeriod()` | Current month/year helper                          |
| `calcSpending()`     | Aggregate spending per category for current period |

### Proposed Split

```
processors/budget/
  ├── budget-command.processor.ts  (orchestrator + parse, ~80 lines)
  ├── budget-set.ts                (handleSet)
  ├── budget-cek.ts                (handleCek + calcSpending + reply formatting)
  └── budget-hapus.ts              (handleHapus)
```

### Checklist

- [ ] Baca full `budget-command.processor.ts`
- [ ] Extract handleSet → `budget-set.ts`
- [ ] Extract handleCek + calcSpending → `budget-cek.ts`
- [ ] Extract handleHapus → `budget-hapus.ts`
- [ ] Rewrite `process()` to delegate

---

## Part E: `monthly-report.processor.ts` → `processors/monthly/`

### Method Boundaries

| Method                   | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `process()`              | Per-user loop, period calc, build, save, send                    |
| `buildMonthlyReport()`   | Aggregate income/expense/transfer, top categories, budget status |
| `buildMessage()`         | Format WA message (header, summary, breakdown, budget, trend)    |
| `buildTrendComparison()` | Compare vs last month                                            |

### Proposed Split

```
processors/monthly/
  ├── monthly-report.processor.ts     (orchestrator, ~80 lines)
  ├── monthly-aggregator.ts           (buildMonthlyReport — data aggregation)
  ├── monthly-message.ts              (buildMessage — WA formatting)
  └── monthly-trend.ts                (buildTrendComparison)
```

### Checklist

- [ ] Baca full `monthly-report.processor.ts`
- [ ] Extract data aggregation → `monthly-aggregator.ts`
- [ ] Extract WA message formatting → `monthly-message.ts`
- [ ] Extract trend comparison → `monthly-trend.ts`
- [ ] Rewrite orchestrator

---

## Part F: `image-ocr.processor.ts` → `processors/ocr/`

### Method Boundaries

| Method                 | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `process()`            | Download image → OCR → guardrail → enqueue or reject |
| Guardrail check inline | FinanceGuardrail.detectIntent()                      |

### Proposed Split

```
processors/ocr/
  ├── image-ocr.processor.ts    (orchestrator, ~100 lines)
  └── ocr-guardrail.ts          (guardrail check + rejection logic)
```

### Checklist

- [ ] Baca full `image-ocr.processor.ts`
- [ ] Extract guardrail logic → `ocr-guardrail.ts`
- [ ] Rewrite orchestrator

---

## Part G: `message.processor.ts` → `processors/incoming/`

### Method Boundaries

| Method      | Purpose                                             |
| ----------- | --------------------------------------------------- |
| `process()` | Save raw message → welcome message → route to queue |

### Proposed Split

```
processors/incoming/
  ├── message.processor.ts       (orchestrator, ~80 lines)
  └── incoming-welcome.ts        (welcome message logic)
```

### Checklist

- [ ] Baca full `message.processor.ts`
- [ ] Extract welcome message logic → `incoming-welcome.ts`
- [ ] Rewrite orchestrator

---

## Prioritas Eksekusi

| #   | Item                                           | Lines | Effort |
| --- | ---------------------------------------------- | ----- | ------ |
| 1   | Part A: `ai-extraction` → `ai/`                | 736   | 1 hr   |
| 2   | Part B: `report` → `report/`                   | 733   | 1 hr   |
| 3   | Part C: `transaction-command` → `transaction/` | 494   | 45 min |
| 4   | Part D: `budget-command` → `budget/`           | 297   | 30 min |
| 5   | Part E: `monthly-report` → `monthly/`          | 294   | 30 min |
| 6   | Part F: `image-ocr` → `ocr/`                   | 254   | 20 min |
| 7   | Part G: `message` → `incoming/`                | 240   | 15 min |
| 8   | Update `worker.module.ts` imports              | —     | 5 min  |
| 9   | Write checkpoint doc                           | —     | 10 min |

**Total:** ~4-5 jam. Bisa dikerjakan per-part (7 session kecil).
