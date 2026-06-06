# Checkpoint #4 — Task 6: Fix AI Analytics — Model, Latency & Cost Data

**Tanggal:** 2026-06-06
**Cakupan:** Task 6 (4 sections) — Fix data gap di analytics dashboard

---

## Ringkasan Perubahan

Task 6 fokus pada memperbaiki data gap antara `trackEvent()` yang dikirim dari processor vs query yang dibaca oleh API analytics. Dashboard analytics page menampilkan card AI Cost, Most Used Model, Avg Latency — tapi semua nilainya 0 / "N/A" / "—" karena key mismatch dan missing fields.

---

## Root Cause — 3 Problems

### Problem 1: Key Name Mismatch

| What       | Processor sent (old) | API reads                  |
| ---------- | -------------------- | -------------------------- |
| Latency    | `durationMs` ❌      | `metadata->>'latencyMs'`   |
| Avg Tokens | `inputTokens` ❌     | `metadata->>'totalTokens'` |

### Problem 2: `model` Tidak Dikirim

`trackEvent` tidak mengirim `model` → `MODE() WITHIN GROUP (ORDER BY metadata->>'model')` selalu `null` → "N/A".

### Problem 3: `cost` Tidak Dihitung

`trackEvent` tidak pernah menghitung/mengirim `cost` → `SUM(metadata->>'cost')` selalu 0 → $0.0000.

---

## 1. `computeAiCost()` Utility — New File

[`apps/worker/src/lib/ai-cost.ts`](apps/worker/src/lib/ai-cost.ts) — pricing table dengan **51 models** mencakup **11 providers** (Alibaba, Anthropic, Byteplus, DeepSeek, Gemini, Mimo, MiniMax, Moonshot, OpenAI, Sumopod, Z.AI). Harga final post-discount. Sumber: `https://sumopod.com/dashboard/ai/models` + AI Model Registry (@toon v1.0).

```typescript
export function computeAiCost(
  inputTokens?: number,
  outputTokens?: number,
  model?: string,
): number;
```

Fallback default: `gpt-4o-mini` tier ($0.15/$0.60 per 1M tokens).

Discount status per 2026-06-06:

- `qwen3.6-flash/plus` — EXPIRED (2026-06-01), base price used
- `qwen3.7-max` — ACTIVE 50%, $1.25/$3.75
- `deepseek-v4-pro` — ACTIVE 75%, $0.43/$0.87
- `MiniMax-M2.7-highspeed` — ACTIVE 80%, $0.02/$0.06
- `MiniMax-M3` — ACTIVE 50%, $0.30/$1.20
- `kimi-k2.6` — ACTIVE 90%, $0.08/$0.35
- `glm-5/glm-5-turbo/glm-5.1` — ACTIVE 90%, $0.10/$0.32

---

## 2. Fix `trackEvent` Payload — `ai-extraction.processor.ts`

### Success Event (`ai.extraction.completed`)

[`ai-extraction.processor.ts:184-196`](apps/worker/src/processors/ai-extraction.processor.ts:184):

```typescript
const model = getConfig("AI_EXTRACTION_MODEL");
const inputTokens = aiUsage?.inputTokens ?? 0;
const outputTokens = aiUsage?.outputTokens ?? 0;

trackEvent({
  category: "ai",
  event: "ai.extraction.completed",
  metadata: {
    userId: data.userId,
    latencyMs: aiLatencyMs, // ✅ was: durationMs
    model, // ✅ NEW
    inputTokens, // ✅ unchanged
    outputTokens, // ✅ unchanged
    totalTokens: inputTokens + outputTokens, // ✅ NEW
    cost: computeAiCost(inputTokens, outputTokens, model), // ✅ NEW
  },
}).catch(() => {});
```

### Failure Event (`ai.extraction.failed`)

[`ai-extraction.processor.ts:209-218`](apps/worker/src/processors/ai-extraction.processor.ts:209):

```typescript
trackEvent({
  category: "ai",
  event: "ai.extraction.failed",
  metadata: {
    userId: data.userId,
    error: err?.message || String(err),
    latencyMs: durationMs, // ✅ was: durationMs (key renamed)
    model: getConfig("AI_EXTRACTION_MODEL"), // ✅ NEW
  },
}).catch(() => {});
```

### New Import

```typescript
import { computeAiCost } from "@/lib/ai-cost";
```

---

## 3. Fix Analytics API — `avgTokens` & Fallback

[`analytics/route.ts:41-44`](apps/dashboard/src/app/api/analytics/route.ts:41):

| Field           | Before                                              | After                                               |
| --------------- | --------------------------------------------------- | --------------------------------------------------- |
| `avgTokens`     | `AVG(metadata->>'inputTokens')` (partial)           | `AVG(metadata->>'totalTokens')` ✅                  |
| `mostUsedModel` | fallback `'unknown'`                                | fallback `'N/A'` ✅                                 |
| Error logging   | `console.error("GET /api/analytics error:", error)` | `logger.error({ route, err }, "Request failed")` ✅ |

New import: `import { logger } from "@/lib/logger";`

---

## 4. End-to-End Data Flow

```
AI Extraction Processor
  ├─ trackEvent("ai.extraction.completed")
  │    metadata: { userId, latencyMs, model, inputTokens, outputTokens, totalTokens, cost }
  └─ trackEvent("ai.extraction.failed")
       metadata: { userId, error, latencyMs, model }

analytics_events table (JSONB metadata column)

/api/analytics?metric=ai  reads:
  ├─ metadata->>'latencyMs'   → avgLatencyMs
  ├─ metadata->>'totalTokens' → avgTokens
  ├─ metadata->>'cost'        → totalCost
  └─ metadata->>'model'       → mostUsedModel

Dashboard Analytics Page
  ├─ Avg Latency card → now shows "Xms" or "Xs" (was "—")
  ├─ Most Used Model card → now shows model name (was "N/A")
  ├─ AI Cost card → now shows "$X.XXXX" (was "$0.0000")
  └─ AI Extractions card → unchanged (always worked)
```

---

## 5. Task 5 Doc Update

[`docs/task/task5.md`](docs/task/task5.md) — semua 11 section checkboxes di-update dari `- [ ]` ke `- [x]`, Prioritas Eksekusi table ditambah kolom Status, dan header ditambah `Status: ✅ Complete`.

---

## Files Modified

| File                                                                                      | Change                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **New:** [`apps/worker/src/lib/ai-cost.ts`](apps/worker/src/lib/ai-cost.ts)               | `computeAiCost()` — 51 models, 11 providers, final post-discount prices           |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:180) | Success `trackEvent`: `durationMs`→`latencyMs`, +`model`, +`cost`, +`totalTokens` |
| [`ai-extraction.processor.ts`](apps/worker/src/processors/ai-extraction.processor.ts:209) | Failure `trackEvent`: `durationMs`→`latencyMs`, +`model`                          |
| [`analytics/route.ts`](apps/dashboard/src/app/api/analytics/route.ts:41)                  | `inputTokens`→`totalTokens`, `'unknown'`→`'N/A'`, `console.error`→logger          |
| [`docs/task/task5.md`](docs/task/task5.md)                                                | All 11 sections `- [ ]` → `- [x]`, Status column added                            |
| [`docs/task/task6.md`](docs/task/task6.md)                                                | All checklist ✅, implementation summary + key mapping added                      |

---

## Key Mapping Summary

| Field         | Old (processor sent)    | New (processor sends) | API reads                  | Match |
| ------------- | ----------------------- | --------------------- | -------------------------- | ----- |
| Latency       | `durationMs`            | `latencyMs`           | `metadata->>'latencyMs'`   | ✅    |
| Model         | _(not sent)_            | `model`               | `metadata->>'model'`       | ✅    |
| Cost          | _(not sent)_            | `cost`                | `metadata->>'cost'`        | ✅    |
| Avg Tokens    | `inputTokens` (partial) | `totalTokens`         | `metadata->>'totalTokens'` | ✅    |
| Input Tokens  | `inputTokens`           | `inputTokens`         | _(not read directly)_      | —     |
| Output Tokens | `outputTokens`          | `outputTokens`        | _(not read directly)_      | —     |
