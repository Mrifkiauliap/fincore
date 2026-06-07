# Checkpoint #7 — OCR & Voice Resilience, Deferred VN Processing, Re-Analyze

**Tanggal:** 2026-06-07
**Cakupan:** `apps/worker`, `packages/ai`, `packages/config`, `apps/dashboard`
**Status:** ✅ Complete

---

## Ringkasan Perubahan

5-phase hardening pipeline untuk OCR (Gemini) dan Voice Transcription (Groq): perbaikan stuck `processingStatus`, retry backoff yang lebih sesuai untuk 503 errors, fallback provider, circuit breaker, deferred processing untuk VN tanpa caption, fitur re-analyze via WA reply & Dashboard, dan `/api/logs` endpoint.

---

## Phase 1 — OCR Resilience (6 items)

### Bug Fix: `processingStatus` Stuck "processing" Setelah OCR Gagal

**Root Cause:** Di catch block [`image-ocr.processor.ts:214-226`](apps/worker/src/processors/ocr/image-ocr.processor.ts:214), hanya insert ke `aiProcessingLogs` tapi **tidak update `rawMessages.processingStatus`** ke `"failed"`. Setelah BullMQ retry exhausted, status tetap `"processing"` selamanya.

**Fix:** [`image-ocr.processor.ts:255-263`](apps/worker/src/processors/ocr/image-ocr.processor.ts:255) — update `processingStatus: "failed"`, set `processingError` dan `processedAt` saat kedua provider (Gemini + Sumopod) gagal.

### Improvement: OCR Retry Backoff 5s

| Before                               | After                                                      |
| ------------------------------------ | ---------------------------------------------------------- |
| Global `defaultJobOptions`: delay 1s | Custom `workerOptions()`: 5s → 10s → 20s → 40s → 60s (cap) |

[`image-ocr.processor.ts:55-65`](apps/worker/src/processors/ocr/image-ocr.processor.ts:55) — override `workerOptions()` dengan `backoffStrategy` custom.

### Improvement: Sumopod Vision Fallback OCR

**New File:** [`packages/ai/src/providers/sumopod-vision.provider.ts`](packages/ai/src/providers/sumopod-vision.provider.ts)

- Fallback OCR via Sumopod (OpenAI-compatible API) saat Gemini 503 atau circuit breaker open
- Default model: `gpt-4.1-nano` — **cheapest vision-capable model** ($0.10/$0.40 per 1M tokens) dari 51 model di [`ai-cost.ts`](apps/worker/src/lib/ai-cost.ts)
- Beda provider (OpenAI) → tidak terpengaruh 503 Google
- Prompt OCR identik dengan Gemini untuk konsistensi output

Config: `OCR_FALLBACK_MODEL="gpt-4.1-nano"` di [`packages/config/src/index.ts:70`](packages/config/src/index.ts:70).

### Improvement: OCR Retry Notification

[`image-ocr.processor.ts:182-188`](apps/worker/src/processors/ocr/image-ocr.processor.ts:182) — pada retry ke-2 (`attemptsMade === 1`), kirim WA ke user:

> ⏳ OCR masih diproses ulang... (percobaan ke-2/3). Mohon tunggu sebentar ya! 🙏

### Improvement: Circuit Breaker — Gemini

**New File:** [`apps/worker/src/lib/circuit-breaker.ts`](apps/worker/src/lib/circuit-breaker.ts)

- Pattern: `CLOSED` → `OPEN` → `HALF_OPEN`
- 5 consecutive failures → circuit OPEN (60s cooldown)
- Saat OPEN: langsung skip ke Sumopod fallback tanpa menunggu retry habis
- Saat HALF_OPEN: 1 trial request; sukses → CLOSED, gagal → OPEN

[`image-ocr.processor.ts:37-41`](apps/worker/src/processors/ocr/image-ocr.processor.ts:37) — `geminiCircuitBreaker` instance.

### OCR Fallback Integration

[`image-ocr.processor.ts:190-266`](apps/worker/src/processors/ocr/image-ocr.processor.ts:190) — Full flow:

1. Cek circuit breaker → OPEN? skip Gemini
2. Coba Gemini → gagal? log warning
3. Final attempt? → coba Sumopod fallback
4. Keduanya gagal? → mark `processingStatus: "failed"` + update error

---

## Phase 2 — Voice Transcription Resilience (5 items)

### Voice Processor Rewritten

[`voice-transcription.processor.ts`](apps/worker/src/processors/voice/voice-transcription.processor.ts) — **same pattern as OCR**:

| Feature            | Implementation                                                                        |
| ------------------ | ------------------------------------------------------------------------------------- |
| Stuck status fix   | Line 175-183: update `processingStatus: "failed"` + `processingError` + `processedAt` |
| Retry backoff 5s   | Line 50-58: custom `workerOptions().settings.backoffStrategy`                         |
| Retry notification | Line 128-133: WA message at `attemptsMade === 1`                                      |
| Circuit breaker    | Line 32-36: `groqCircuitBreaker` — 5 failures, 60s cooldown                           |

---

## Phase 3 — Re-Analyze Failed Messages (4 items)

### WA: Reply "ulangi" to Failed Message

[`message.processor.ts:225-293`](apps/worker/src/processors/incoming/message.processor.ts:225) — Handler when user replies `"ulangi"` / `"proses ulang"` / `"retry"`:

1. Lookup quoted `rawMessage` by `replyToId`
2. Check `processingStatus === "failed"` or `"pending_confirmation"`
3. Reset status → `"processing"`, clear error
4. Re-enqueue OCR or VOICE_TRANSCRIPTION job
5. Send WA: "🔄 Memproses ulang pesan suara ini..."

### Dashboard: GET `/api/logs` Endpoint

**New File:** [`apps/dashboard/src/app/api/logs/route.ts`](apps/dashboard/src/app/api/logs/route.ts)

- `?page=1&limit=15&search=indomaret&status=failed`
- Returns `rawMessages` joined with `aiProcessingLogs` and `rawAiOutputs`
- Pagination metadata: `total`, `totalPages`, `hasNext`, `hasPrev`

### Dashboard: POST `/api/logs/retry` Endpoint

**New File:** [`apps/dashboard/src/app/api/logs/retry/route.ts`](apps/dashboard/src/app/api/logs/retry/route.ts)

- Body: `{ rawMessageId: string }`
- Accepts `failed` and `pending_confirmation` statuses
- Resets status → `"processing"`, re-enqueues appropriate job
- Returns `{ success: true }`

### Dashboard: Retry Button in System Logs

[`system/page.tsx`](apps/dashboard/src/app/dashboard/system/page.tsx) — Changes:

- Added `🔄 Retry` button (amber, with `RefreshCw` icon) on failed/pending_confirmation messages
- `canRetry()` helper: only for voice/image/document with correct status
- `handleRetry()` → POST `/api/logs/retry` → refresh table
- Loading spinner while retrying

---

## Phase 4 — Config & Dependencies (3 items)

| File                                                              | Change                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| [`packages/config/src/index.ts`](packages/config/src/index.ts:70) | Added `OCR_FALLBACK_MODEL: z.string().default("gpt-4.1-nano")` |
| [`packages/ai/src/index.ts`](packages/ai/src/index.ts:6)          | Export `sumopod-vision.provider`                               |
| [`dashboard/package.json`](apps/dashboard/package.json)           | Added `@fincore/queue` + `@fincore/shared` workspace deps      |

---

## Phase 5 — Deferred VN Processing (6 items)

### Problem

Voice Note (VN) di WhatsApp **tidak bisa pakai caption**. AI extraction langsung jalan tanpa konteks (tags, payment method, dll) → hasil transaksi tidak akurat. User harus reply dengan konteks — tapi transcription jalan 2x (sia-sia, buang Groq token).

### Solution: `pending_confirmation` Status

**Flow Baru untuk VN tanpa caption:**

```
User: 🎤 [sends VN]
Bot:  🎤 Transkripsi suara:
      "beli kopi 25rb"

      📝 Balas pesan ini dengan konteks, contoh:
      //catat pake bank jago #utility #kopi

User: (reply) //catat pake gopay #kopi #kantor
Bot:  ✅ Konteks diterima! Memproses transaksi...
      → guardrail check → AI extraction dengan FULL context
```

**Voice Processor Change:** [`voice-transcription.processor.ts:228-249`](apps/worker/src/processors/voice/voice-transcription.processor.ts:228)

- Cek `data.caption`: kalau **null/empty** (VN), defer:
  - Set `processingStatus: "pending_confirmation"`
  - Save transcript ke `rawMessages.body`
  - Send WA asking for context
  - **Jangan** lanjut ke guardrail/AI extraction

**Message Processor Change:** [`message.processor.ts:175-275`](apps/worker/src/processors/incoming/message.processor.ts:175)

- Deteksi reply ke VN dengan `processingStatus === "pending_confirmation"`
- Cek reply text:
  - `"ulangi"` → re-transcribe (reset ke processing)
  - Context text → merge transcript + user caption → guardrail → AI extraction (**skip re-transcription!**)
- Send WA: "✅ Konteks diterima! Memproses transaksi..."

### Behavior Matrix

| Tipe WA                  | Ada Caption?    | Behavior                                                    |
| ------------------------ | --------------- | ----------------------------------------------------------- |
| **Voice Note (VN)**      | ❌ (tidak bisa) | Transcribe → defer → minta konteks → AI extract after reply |
| **Document (audio)**     | ✅ (bisa)       | Transcribe → guardrail → AI extract langsung                |
| **Document (image/PDF)** | ✅ (bisa)       | OCR → guardrail → AI extract langsung                       |

### Dashboard: `pending_confirmation` Badge + Retry

[`system/page.tsx`](apps/dashboard/src/app/dashboard/system/page.tsx):

- Purple `⏸️ Waiting Context` badge
- `🔄 Retry` button enabled for `pending_confirmation` and `failed`
- Filter dropdown: `⏸️ Waiting Context` option
- `canRetry()` helper updated: `log.processingStatus === "failed" || log.processingStatus === "pending_confirmation"`

---

## Files Modified (All Phases)

### New Files (6)

| File                                                                                                           | Purpose                                 |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [`packages/ai/src/providers/sumopod-vision.provider.ts`](packages/ai/src/providers/sumopod-vision.provider.ts) | Sumopod OCR fallback via `gpt-4.1-nano` |
| [`apps/worker/src/lib/circuit-breaker.ts`](apps/worker/src/lib/circuit-breaker.ts)                             | Circuit breaker pattern                 |
| [`apps/dashboard/src/app/api/logs/route.ts`](apps/dashboard/src/app/api/logs/route.ts)                         | GET logs endpoint                       |
| [`apps/dashboard/src/app/api/logs/retry/route.ts`](apps/dashboard/src/app/api/logs/retry/route.ts)             | POST retry endpoint                     |

### Modified Files (8)

| File                                                                                                    | Change                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`image-ocr.processor.ts`](apps/worker/src/processors/ocr/image-ocr.processor.ts)                       | **Rewritten** — stuck fix, backoff, fallback, notification, circuit breaker |
| [`voice-transcription.processor.ts`](apps/worker/src/processors/voice/voice-transcription.processor.ts) | **Rewritten** — same pattern as OCR + deferred VN processing                |
| [`message.processor.ts`](apps/worker/src/processors/incoming/message.processor.ts)                      | **Rewritten** — re-analyze handler + deferred VN reply handler              |
| [`packages/config/src/index.ts`](packages/config/src/index.ts)                                          | Added `OCR_FALLBACK_MODEL`                                                  |
| [`packages/ai/src/index.ts`](packages/ai/src/index.ts)                                                  | Export `sumopod-vision.provider`                                            |
| [`dashboard/package.json`](apps/dashboard/package.json)                                                 | Added `@fincore/queue` + `@fincore/shared`                                  |
| [`system/page.tsx`](apps/dashboard/src/app/dashboard/system/page.tsx)                                   | Retry button + pending_confirmation badge + filter                          |
| [`.env.example`](.env.example)                                                                          | Added `OCR_FALLBACK_MODEL` comment                                          |

---

## Complete OCR Flow (After All Phases)

```
Image/Document Message
  ├─ Download from WAHA → validate size → compress via Sharp → save to storage
  ├─ OCR: Gemini (primary) with circuit breaker
  │   ├─ Circuit OPEN? → skip to fallback
  │   ├─ Gemini 503/error → log, continue to fallback on final attempt
  │   └─ Circuit breaker: 5 failures → OPEN 60s
  ├─ Fallback: Sumopod gpt-4.1-nano (final attempt only)
  ├─ Both fail? → processingStatus = "failed" ✅ (not stuck!)
  ├─ Empty result? → processingStatus = "skipped"
  ├─ Guardrail check → allowed?
  └─ Enqueue AI extraction with OCR text

Retry path:
  ├─ BullMQ: 3 attempts, 5s exponential backoff
  ├─ WA: reply "ulangi" to failed message → re-process from storage
  └─ Dashboard: 🔄 Retry button → POST /api/logs/retry → re-enqueue
```

## Complete Voice Flow (After All Phases)

```
Voice Message
  ├─ VN (no caption)
  │   ├─ Download → validate → save to storage
  │   ├─ Transcribe via Groq Whisper (with circuit breaker)
  │   ├─ Success? → save transcript, set pending_confirmation, ask for context
  │   └─ User replies with context → merge → guardrail → AI extract
  │
  ├─ Audio Document (has caption)
  │   ├─ Transcribe → guardrail → AI extract (direct)
  │
  └─ Both fail? → processingStatus = "failed" ✅

Retry path:
  ├─ BullMQ: 3 attempts, 5s exponential backoff
  ├─ Circuit breaker: 5 failures → OPEN 60s
  ├─ WA: reply "ulangi" to pending_confirmation → re-transcribe
  └─ Dashboard: 🔄 Retry button → re-enqueue transcription
```

---

## Prinsip Desain

- **Tanpa caption → defer**: VN tanpa caption tidak dipaksa AI extraction — tunggu user reply dengan konteks
- **Transcript stored**: Tidak perlu re-transcribe saat user reply dengan konteks — hemat Groq token
- **Circuit breaker**: Mencegah spam retry ke provider yang sedang down (503)
- **Dual retry path**: WA ("ulangi") + Dashboard (🔄 Retry button) — user bisa pilih
- **Provider diversity**: Fallback OCR pake Sumopod (OpenAI) — berbeda dari Gemini (Google) untuk true resilience
- **Semua stuck status fixed**: Baik OCR maupun voice sekarang set `processingStatus: "failed"` saat permanent failure
