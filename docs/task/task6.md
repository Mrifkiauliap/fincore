# Task 6: Fix AI Analytics — Model, Latency & Cost Data

**Tanggal:** 2026-06-06
**Prioritas:** 🟡 Sedang (analytics dashboard kosong)
**Estimasi:** 2-3 jam

---

## Overview

Dashboard analytics page di [`apps/dashboard/src/app/dashboard/system/analytics/page.tsx`](apps/dashboard/src/app/dashboard/system/analytics/page.tsx) menampilkan card AI Cost, Most Used Model, Avg Latency — tapi semua nilainya 0 / "N/A" / "—".

Penyebab: **data gap** antara [`trackEvent()`](packages/db/src/index.ts:46) yang dikirim dari processor vs query yang dibaca oleh API analytics.

---

## Root Cause Analysis — 3 Problems

### Problem 1: Key Name Mismatch

| What       | `trackEvent` sends             | API reads                  |
| ---------- | ------------------------------ | -------------------------- |
| Latency    | `durationMs` ❌                | `metadata->>'latencyMs'`   |
| Avg Tokens | `inputTokens` ✅ (hanya input) | `metadata->>'inputTokens'` |

[`ai-extraction.processor.ts:179-188`](apps/worker/src/processors/ai-extraction.processor.ts:179):

```typescript
trackEvent({
  category: "ai",
  event: "ai.extraction.completed",
  metadata: {
    userId: data.userId,
    durationMs, // ❌ API expects "latencyMs"
    inputTokens: aiUsage?.inputTokens,
    outputTokens: aiUsage?.outputTokens,
  },
}).catch(() => {});
```

[`/api/analytics?metric=ai`](apps/dashboard/src/app/api/analytics/route.ts:40):

```sql
avgLatencyMs: AVG((metadata->>'latencyMs')::numeric)  -- ❌ reads "latencyMs", stored as "durationMs"
```

### Problem 2: `model` Tidak Dikirim

[`raw_ai_outputs.model`](packages/db/src/schema/raw-ai-outputs.ts:30) menyimpan model (`gpt-4o-mini`) tapi `trackEvent` tidak mengirim `model` di metadata. Akibatnya:

```sql
mostUsedModel: MODE() WITHIN GROUP (ORDER BY metadata->>'model')
```

→ selalu `null` → tampil "N/A"

### Problem 3: `cost` Tidak Dihitung

`trackEvent` tidak pernah menghitung atau mengirim `cost`. API analytics membaca `metadata->>'cost'` yang selalu `null`.

Perlu **pricing table** di worker yang menghitung:

```
cost = (inputTokens × INPUT_PRICE + outputTokens × OUTPUT_PRICE) / 1_000_000
```

---

## Checklist

### 1. Fix `trackEvent` payload di [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:179) ✅

- [x] Rename `durationMs` → `latencyMs` (sesuai nama di `raw_ai_outputs.latencyMs`)
- [x] Tambah `model` dari `getConfig("AI_EXTRACTION_MODEL")` (model yang digunakan untuk extraction ini)
- [x] Tambah `cost` — hitung dari token pricing
- [x] Tambah `totalTokens` = `inputTokens + outputTokens` (untuk avg tokens yang lebih akurat)

**After fix (actual):** see [`ai-extraction.processor.ts:184-196`](apps/worker/src/processors/ai-extraction.processor.ts:184)

### 2. Buat `computeAiCost()` utility ✅

- [x] Buat file [`apps/worker/src/lib/ai-cost.ts`](apps/worker/src/lib/ai-cost.ts)
- [x] Pricing table (hardcode, bisa di-extract ke config nanti):

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 }, // per 1M tokens
  "gpt-4o": { input: 2.5, output: 10.0 },
  // default fallback
};

export function computeAiCost(
  inputTokens?: number,
  outputTokens?: number,
  model?: string,
): number {
  const pricing = MODEL_PRICING[model ?? "gpt-4o-mini"] ?? {
    input: 0.15,
    output: 0.6,
  };
  const inCost = ((inputTokens ?? 0) / 1_000_000) * pricing.input;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * pricing.output;
  return inCost + outCost;
}
```

### 3. Update analytics API query di [`/api/analytics?metric=ai`](apps/dashboard/src/app/api/analytics/route.ts:35) ✅

- [x] Pendekatan simpler: fix key names di JSONB queries, tidak join ke `raw_ai_outputs`
  - `avgTokens` → `AVG(metadata->>'totalTokens')` (was `inputTokens` — now reads total tokens)
  - `mostUsedModel` → fallback `'N/A'` (was `'unknown'`)
  - `latencyMs` key sudah benar (tinggal nunggu processor kirim key yang sama)
  - `cost` key sudah benar (tinggal nunggu processor kirim `cost`)
- [x] `console.error` → `logger.error()` (consistent with Task 5)

### 4. Verifikasi end-to-end

- [x] Processor siap — `trackEvent` mengirim `latencyMs`, `model`, `cost`, `totalTokens`
- [x] API analytics membaca JSONB keys yang sama dengan yang dikirim processor
- [ ] Jalankan processor AI extraction, cek bahwa `analytics_events.metadata` berisi `model`, `latencyMs`, `cost`, `totalTokens`
- [ ] Buka `/api/analytics?metric=ai&days=30` — pastikan response ada data
- [ ] Buka dashboard analytics page — pastikan semua card terisi (bukan "—" / "N/A" / "$0.0000")

---

## Data Flow Diagram

```
User WhatsApp message
  → messsage.processor.ts
  → ai-extraction.processor.ts
      ├─ raw_ai_outputs (model, tokens, latencyMs)  [audit log]
      └─ trackEvent("ai.extraction.completed", {
             model, latencyMs, cost, totalTokens     [ analytics ]
         })
  → analytics_events table
  → /api/analytics?metric=ai
  → Dashboard analytics page
```

---

## Files Modified

| File                                                                                      | Change                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:180) | ✅ Fix trackEvent metadata: `durationMs`→`latencyMs`, add `model`, `cost`, `totalTokens` |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:209) | ✅ Also fix `ai.extraction.failed` event: `durationMs`→`latencyMs`, add `model`          |
| **New:** [`apps/worker/src/lib/ai-cost.ts`](apps/worker/src/lib/ai-cost.ts)               | ✅ `computeAiCost()` utility + pricing table for 7 models                                |
| [`/api/analytics/route.ts`](apps/dashboard/src/app/api/analytics/route.ts:41)             | ✅ `inputTokens`→`totalTokens`, fallback `'unknown'`→`'N/A'`, `console.error`→logger     |

---

## Prioritas Eksekusi

| #   | Item                                                | Effort   | Impact                             | Status |
| --- | --------------------------------------------------- | -------- | ---------------------------------- | ------ |
| 1   | Fix key names (`durationMs` → `latencyMs`)          | 2 menit  | 🔴 Unblocks avg latency            | ✅     |
| 2   | Add `model` to trackEvent                           | 2 menit  | 🔴 Unblocks "Most Used Model"      | ✅     |
| 3   | Create `computeAiCost()` + add `cost` to trackEvent | 15 menit | 🔴 Unblocks "AI Cost"              | ✅     |
| 4   | Option A: Fix analytics API JSONB queries (simpler) | 30 menit | 🟡 Makes data show up              | ✅     |
| 5   | Option B: Join `raw_ai_outputs` for richer data     | 1 jam    | 🟢 More accurate, but more complex | ⏭️     |
| 6   | End-to-end verification                             | 15 menit | 🔴 Confirms everything works       | ⏳     |

---

## Implementation Summary

### Root Cause

The analytics API already read the correct JSONB keys (`latencyMs`, `model`, `cost`) — but `trackEvent()` in the processor sent different/wrong keys:

| Field      | Processor sent (old)    | API reads                  | Processor sends (new) |
| ---------- | ----------------------- | -------------------------- | --------------------- |
| Latency    | `durationMs` ❌         | `metadata->>'latencyMs'`   | `latencyMs` ✅        |
| Model      | _(not sent)_ ❌         | `metadata->>'model'`       | `model` ✅            |
| Cost       | _(not sent)_ ❌         | `metadata->>'cost'`        | `cost` ✅             |
| Avg Tokens | `inputTokens` (partial) | `metadata->>'totalTokens'` | `totalTokens` ✅      |

### Key Mapping After Fix

```
ai-extraction.processor.ts
  ├─ trackEvent("ai.extraction.completed")
  │    metadata: { userId, latencyMs, model, inputTokens, outputTokens, totalTokens, cost }
  └─ trackEvent("ai.extraction.failed")
       metadata: { userId, error, latencyMs, model }

/analytics?metric=ai  reads:
  ├─ metadata->>'latencyMs'   → avgLatencyMs
  ├─ metadata->>'totalTokens' → avgTokens
  ├─ metadata->>'cost'        → totalCost
  └─ metadata->>'model'       → mostUsedModel
```
