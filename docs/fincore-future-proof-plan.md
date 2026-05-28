# FinCore — Future-Proof Plan

## Event Publisher & Finance Core Migration Path

**Status:** Planning Document
**Berlaku saat:** Finance Core project mulai dibangun

---

## 1. Konteks: Kenapa Perlu Ini

FinCore saat ini menyimpan data transaksi dan mengirim laporan langsung ke user via WhatsApp.

Ini pragmatis untuk sekarang, tapi ada masalah jangka panjang:

```
❌ Masalah:
   FinCore tahu tentang "laporan bulanan", "spending trend", dll
   Padahal itu bukan domain FinCore — itu domain Finance Core

✅ Yang seharusnya:
   FinCore  → "Transaksi masuk, sudah dinormalisasi, ini event-nya"
   Finance Core → "Oke, gw proses untuk budgeting, reporting, analytics"
```

---

## 2. Target Arsitektur (Setelah Finance Core Jadi)

```
┌──────────────────────────────────────────────────────────────┐
│  FinCore (Ingestion Engine)                                  │
│                                                              │
│  Input: WA text/voice/image                                  │
│  Output: normalized FinancialEvent                           │
│                                                              │
│  Responsibility:                                             │
│  ✅ OCR, transcription, AI extraction                        │
│  ✅ Normalization & validation                               │
│  ✅ Raw data preservation                                    │
│  ✅ Ingestion confirmation ke user ("✅ Tercatat: Rp 25k")   │
│  ❌ BUKAN: budgeting, reporting, analytics, reconciliation   │
└─────────────────────┬────────────────────────────────────────┘
                      │
          FinancialEvent (webhook / pub-sub)
                      │
┌─────────────────────▼────────────────────────────────────────┐
│  Finance Core (Accounting Engine)                            │
│                                                              │
│  Input: FinancialEvent dari FinCore                          │
│  Output: ledger, report, budget alert, analytics             │
│                                                              │
│  Responsibility:                                             │
│  ✅ Double-entry accounting (future)                         │
│  ✅ Budgeting & limits                                       │
│  ✅ Reporting (harian, mingguan, bulanan)                    │
│  ✅ Anomaly detection                                        │
│  ✅ Reconciliation                                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Yang Perlu Ditambah ke FinCore Sekarang

### 3.1 Schema Additions — `transactions` table

Tambah 3 field berikut ke tabel `transactions` via migration baru:

```sql
-- Migration: add event publishing fields
ALTER TABLE transactions
  ADD COLUMN event_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN published_at TIMESTAMP;

CREATE INDEX idx_transactions_is_published ON transactions(is_published)
  WHERE is_published = FALSE;
-- Partial index: only unpublished transactions, efficient untuk polling
```

**Drizzle schema update:**

```ts
// Tambah ke transactions table definition
eventId: uuid('event_id').defaultRandom().notNull().unique(),
// ↑ Public-facing stable ID. Consumers reference ini, bukan internal `id`.
//   Saat Finance Core consume event, dia simpan event_id untuk idempotency.

isPublished: boolean('is_published').default(false).notNull(),
// ↑ Apakah event sudah di-fire ke Finance Core / external consumers.
//   Default false = belum dipublish.

publishedAt: timestamp('published_at'),
// ↑ Kapan pertama kali event berhasil dipublish.
//   NULL = belum pernah dipublish.
```

**Kenapa `event_id` berbeda dari `id`?**

```
id        = internal PostgreSQL PK, auto-generated, jangan expose ke luar
event_id  = public identifier, stable, untuk dikonsumsi Finance Core
            Finance Core simpan event_id untuk idempotency check
            Kalau FinCore kirim ulang event yang sama, Finance Core tau
            sudah pernah diproses → skip (no double-counting)
```

---

### 3.2 Package Baru: `packages/event-publisher`

Model: **multi-webhook subscriber registry** — persis seperti GitHub/Stripe/Clerk webhooks.
Satu event bisa di-deliver ke banyak consumer secara parallel, masing-masing independent.

```
packages/event-publisher/
├── src/
│   ├── index.ts
│   ├── event-publisher.service.ts      ← multi-delivery orchestrator
│   ├── webhook-registry.service.ts     ← 🆕 manage subscriptions dari DB + env bootstrap
│   ├── contracts/
│   │   ├── financial-event.ts          ← FinancialEvent type
│   │   └── webhook-subscription.ts     ← 🆕 WebhookSubscription type
│   └── transports/
│       ├── webhook.transport.ts        ← single HTTP delivery + HMAC signing
│       └── noop.transport.ts           ← no-op saat tidak ada subscriber aktif
└── package.json
```

**`FinancialEvent` contract — tidak berubah:**

```ts
export interface FinancialEvent {
  eventId: string; // = transactions.event_id (public, stable)
  eventType: FinancialEventType;
  occurredAt: string; // ISO 8601
  schemaVersion: "1.0";
  source: {
    system: "fincore";
    userId: string;
    rawMessageId: string | null;
    ingestionMethod: "text" | "voice" | "image";
    confidenceScore: number;
    isAiGenerated: true;
  };
  payload: {
    transactionId: string;
    type: "expense" | "income" | "transfer";
    amount: number;
    fee: number;
    totalAmount: number;
    currency: string;
    categorySlug: string;
    merchant: string | null;
    location: string | null;
    paymentMethod: string | null;
    toPaymentMethod: string | null;
    transactionDate: string;
    notes: string | null;
    name: string | null;
  };
}

export type FinancialEventType =
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted";
```

**`WebhookSubscription` contract:**

```ts
// packages/event-publisher/src/contracts/webhook-subscription.ts

export interface WebhookSubscription {
  id: string;
  name: string; // e.g. "Finance Core Production"
  url: string; // target endpoint
  hashedSecret: string; // bcrypt hash, NEVER store plaintext
  eventTypes: FinancialEventType[] | ["*"]; // ['*'] = subscribe semua events
  isActive: boolean;
  timeoutMs: number; // default 10_000
  maxRetries: number; // default 3
  createdAt: Date;
  lastTriggeredAt: Date | null;
  lastResponseStatus: number | null;
}

export interface DeliveryResult {
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  attempt: number;
}
```

**`EventPublisher` — multi-delivery orchestrator:**

```ts
// packages/event-publisher/src/event-publisher.service.ts

export class EventPublisher {
  constructor(private readonly registry: WebhookRegistryService) {}

  async publish(event: FinancialEvent): Promise<DeliveryResult[]> {
    // 1. Get all active subscribers for this event type
    const subscribers = await this.registry.getActiveSubscribers(
      event.eventType,
    );

    if (subscribers.length === 0) {
      logger.debug(
        { eventId: event.eventId },
        "No active subscribers, skipping",
      );
      return [];
    }

    // 2. Deliver to ALL subscribers in parallel — each is independent
    //    One failure does NOT block others
    const results = await Promise.allSettled(
      subscribers.map((sub) => this.deliverToOne(event, sub)),
    );

    // 3. Return all results (successes + failures)
    return results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { success: false, error: String(r.reason) },
    );
  }

  private async deliverToOne(
    event: FinancialEvent,
    sub: WebhookSubscription,
  ): Promise<DeliveryResult> {
    const transport = new WebhookTransport(sub);
    return transport.deliver(event);
  }

  // For catch-up: re-publish all unpublished transactions
  async catchUp(events: FinancialEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
```

**`WebhookRegistryService` — manages subscriptions:**

```ts
// packages/event-publisher/src/webhook-registry.service.ts

export class WebhookRegistryService {
  // Load active subscriptions from DB
  async getActiveSubscribers(
    eventType: FinancialEventType,
  ): Promise<WebhookSubscription[]> {
    const db = getDb();
    // Query webhook_subscriptions where is_active = true
    // AND (event_types @> ARRAY[eventType] OR event_types @> ARRAY['*'])
  }

  // Called at app startup — auto-register subscriptions defined in env
  // This makes env vars a "shortcut" to insert rows, not the source of truth
  async bootstrapFromEnv(): Promise<void> {
    const envSubscriptions = this.parseEnvSubscriptions();
    for (const sub of envSubscriptions) {
      await this.upsertByName(sub);  // insert if not exists, skip if already registered
    }
  }

  // Format: FINCORE_WEBHOOK_<NAME>=url|secret|event_filter
  // Example: FINCORE_WEBHOOK_FINANCE_CORE=https://finance.app/events|secret123|*
  // Example: FINCORE_WEBHOOK_SHEETS=https://script.google.com/...|secretxyz|transaction.created
  private parseEnvSubscriptions() { ... }
}
```

---

### 3.3 Queue Baru: `event-publishing`

Tambah ke `QueueName` di `packages/shared`:

```ts
export const QueueName = {
  // ... existing queues ...
  EVENT_PUBLISHING: "event-publishing", // ✅ sudah ditambah
} as const;

export const JobName = {
  // ... existing jobs ...
  PUBLISH_FINANCIAL_EVENT: "publish-financial-event", // ✅ sudah ditambah
} as const;
```

**Flow setelah transaksi tersimpan — multi-delivery:**

```
Transaction saved (is_published = false)
      ↓
Enqueue: event-publishing job
      ↓
EventPublishingProcessor
      ↓
WebhookRegistryService.getActiveSubscribers(eventType)
      ↓
  ┌── Tidak ada subscriber aktif?
  │     → log debug, skip, is_published tetap FALSE
  │       (akan di-pickup catch-up job saat subscriber terdaftar)
  │
  └── Ada N subscriber aktif?
        → deliver ke SEMUA secara parallel
        │
        ├── Finance Core  → ✅ 200 OK → log success
        ├── Google Sheets → ✅ 200 OK → log success
        └── Custom Script → ❌ timeout → retry (backoff)
        │
        → Jika SEMUA gagal: is_published tetap FALSE, job retry
        → Jika SEBAGIAN sukses: is_published = TRUE, catat per-subscriber result
        → Update webhook_subscriptions.last_triggered_at, last_response_status
```

**Per-subscriber delivery result disimpan di `webhook_delivery_logs`:**

```
webhook_delivery_logs:
  id, event_id, subscription_id,
  attempt, status_code, duration_ms,
  success, error, delivered_at
```

Berguna untuk:

- Debug kenapa consumer tidak menerima event
- Monitoring health per subscriber
- Manual re-deliver dari Bull Board

---

### 3.4 DB Schema Baru: `webhook_subscriptions` + `webhook_delivery_logs`

Ini adalah **source of truth** untuk semua subscriber. Env vars hanya bootstrap shortcut.

**Drizzle schema:**

```ts
// packages/db/src/schema/webhook-subscriptions.ts

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: text("name").notNull(),
    // ↑ Human-readable label. e.g. "Finance Core Production", "Google Sheets Sync"
    //   Dipakai untuk env bootstrap: FINCORE_WEBHOOK_FINANCE_CORE → name = "FINANCE_CORE"

    url: text("url").notNull(),
    // ↑ Target endpoint. e.g. "https://financecore.app/api/events/ingest"

    hashedSecret: text("hashed_secret").notNull(),
    // ↑ bcrypt hash dari shared secret.
    //   NEVER store plaintext. Consumer verify via HMAC-SHA256 header.

    eventTypes: text("event_types").array().notNull().default(["*"]),
    // ↑ Filter event apa saja yang di-deliver.
    //   ['*']                                      = semua events
    //   ['transaction.created']                    = hanya created
    //   ['transaction.created','transaction.deleted'] = created + deleted

    isActive: boolean("is_active").default(true).notNull(),

    timeoutMs: integer("timeout_ms").default(10_000).notNull(),
    maxRetries: integer("max_retries").default(3).notNull(),

    // ── Tracking ─────────────────────────────────────────────────────────────
    lastTriggeredAt: timestamp("last_triggered_at"),
    lastResponseStatus: integer("last_response_status"),
    // ↑ Status code dari delivery terakhir, untuk health monitoring

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    nameIdx: index("idx_webhook_subscriptions_name").on(t.name),
    activeIdx: index("idx_webhook_subscriptions_active").on(t.isActive),
  }),
);

// ─── Delivery log per subscriber per event ────────────────────────────────────
export const webhookDeliveryLogs = pgTable(
  "webhook_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    // ↑ = transactions.event_id — reference ke event yang di-deliver

    subscriptionId: uuid("subscription_id")
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" })
      .notNull(),

    attempt: integer("attempt").default(1).notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    success: boolean("success").default(false).notNull(),
    error: text("error"),
    deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  },
  (t) => ({
    eventIdx: index("idx_webhook_delivery_logs_event_id").on(t.eventId),
    subIdx: index("idx_webhook_delivery_logs_subscription_id").on(
      t.subscriptionId,
    ),
  }),
);
```

**Env-based bootstrap (shortcut, bukan source of truth):**

```bash
# .env — format: FINCORE_WEBHOOK_<NAME>=url|secret|event_filter
# Saat startup, WebhookRegistryService auto-upsert ke tabel webhook_subscriptions
# Kalau nama sudah ada di DB, skip (tidak overwrite yang sudah di-edit manual)

# Subscribe semua events
FINCORE_WEBHOOK_FINANCE_CORE=https://financecore.app/api/events/ingest|secretABC|*

# Subscribe hanya transaction.created
FINCORE_WEBHOOK_SHEETS=https://script.google.com/macros/...|secretXYZ|transaction.created

# Subscribe multiple events (pipe-separated)
FINCORE_WEBHOOK_NOTIF=https://hooks.zapier.com/...|secretDEF|transaction.created,transaction.deleted

# ─── Legacy single-webhook (backward compat, masih support) ─────────────────
# Kalau FINANCE_CORE_WEBHOOK_URL masih diset, auto-register sebagai subscriber "LEGACY"
FINANCE_CORE_WEBHOOK_URL=
FINANCE_CORE_WEBHOOK_SECRET=
```

**Kenapa env hanya bootstrap, bukan source of truth?**

```
Keuntungan DB sebagai source of truth:
  ✅ Bisa tambah/pause/hapus subscriber tanpa restart app
  ✅ Bisa lihat health (last_triggered_at, last_response_status) dari DB
  ✅ Bisa manage via admin panel di masa depan
  ✅ Tidak perlu redeploy untuk onboard consumer baru

Env vars tetap berguna untuk:
  ✅ Initial setup yang cepat (tidak perlu INSERT manual)
  ✅ Infrastructure-as-code (GitOps)
  ✅ Development & staging yang beda config dari production
```

---

## 4. Reports: Rencana Migrasi

### Sekarang (FinCore handles reports)

```
FinCore:
  ✅ Generate basic daily/weekly/monthly summary
  ✅ Kirim via WhatsApp
  ✅ Simpan di tabel reports
  ✅ Handle on-demand queries ("berapa pengeluaranku...")
```

Ini pragmatis dan masuk akal selama Finance Core belum ada.

### Nanti (Setelah Finance Core Jadi)

**Fase 1 — Dual mode (transisi):**

```
FinCore     → masih generate reports (backward compat)
Finance Core → mulai generate reports sendiri dari event stream
```

**Fase 2 — FinCore off-loads:**

```
FinCore     → hanya kirim ingestion confirmation
              "✅ Tercatat: Makan siang Rp 25.000 via GoPay"
Finance Core → kirim semua laporan ke user
```

**Fase 3 — Cleanup:**

```
FinCore     → hapus ReportGenerationProcessor
              hapus/archive tabel reports
              hapus QUERY_REPORT intent dari guardrail
Finance Core → full ownership laporan
```

**Yang perlu dilakukan di FinCore untuk support migrasi:**

```ts
// Di ReportGenerationProcessor, tambah feature flag
const useFinanceCoreReports =
  process.env.FINANCE_CORE_REPORTS_ENABLED === "true";

if (useFinanceCoreReports) {
  // Delegate ke Finance Core via API call
  // FinCore hanya jadi relay
} else {
  // Generate report sendiri (current behavior)
}
```

---

## 5. Recurring Bills — Alignment dengan Ingestion Domain

`recurring_bills` yang sudah ada di schema ini sebenarnya berada di **grey area**:

```
Ingestion domain:
  ✅ Boleh ada di FinCore:
     - Reminder "Bayar Netflix besok Rp 54k" via WhatsApp
     - Auto-match incoming "bayar netflix" ke recurring bill
     - Mencegah user input manual untuk tagihan yang sudah dikenal

Accounting domain (migrasi nanti):
  - Budget allocation untuk recurring bills
  - Cash flow projection
  - Reconciliation against bank statements
```

**Kesimpulan:** `recurring_bills` BOLEH di FinCore untuk keperluan ingestion assistance dan reminder. Data ini akan di-expose ke Finance Core via event/API saat waktunya tiba.

---

## 6. Migration Checklist (Untuk Nanti)

Tandai ini saat Finance Core mulai dibangun:

**Setup awal:**

- [ ] Buat Finance Core project dengan REST API endpoint `/api/events/ingest`
- [ ] Finance Core implement HMAC-SHA256 signature verification
- [ ] Finance Core implement idempotency check via `event_id`
- [ ] Tambah env: `FINCORE_WEBHOOK_FINANCE_CORE=url|secret|*`
- [ ] Restart FinCore → auto-register Finance Core sebagai subscriber
- [ ] Verify delivery via `webhook_delivery_logs`

**Paralel mode (2 minggu):**

- [ ] Finance Core consume `transaction.created` events
- [ ] FinCore masih generate reports (backward compat)
- [ ] Monitor: bandingkan data Finance Core vs FinCore, pastikan match

**Handover:**

- [ ] Set `FINANCE_CORE_REPORTS_ENABLED=true` di FinCore
- [ ] Finance Core kirim semua laporan ke user
- [ ] Monitor 1 minggu — pastikan tidak ada laporan yang hilang

**Cleanup (opsional, tidak urgent):**

- [ ] Archive tabel `reports` di FinCore (jangan drop, jaga history)
- [ ] Hapus `ReportGenerationProcessor` dari worker
- [ ] Hapus `QUERY_REPORT` intent dari guardrail
- [ ] FinCore hanya kirim ingestion confirmations
- [ ] Celebrate 🎉

---

## 7. Summary Perubahan yang Perlu Dilakukan Sekarang

| Action                                                                            | Priority | Effort   |
| --------------------------------------------------------------------------------- | -------- | -------- |
| Tambah `event_id`, `is_published`, `published_at` ke `transactions` via migration | High     | 15 menit |
| Buat tabel `webhook_subscriptions` + `webhook_delivery_logs` di schema            | High     | 20 menit |
| Refactor `EventPublisher` ke multi-delivery + `WebhookRegistryService`            | Medium   | 45 menit |
| Tambah `WebhookSubscription` + `DeliveryResult` contract                          | Medium   | 15 menit |
| Update env vars → format `FINCORE_WEBHOOK_<NAME>=url\|secret\|filter`             | Low      | 10 menit |
| Update `packages/analytics` → remove                                              | Low      | 5 menit  |

---

## 8. Perbandingan: Singleton vs Multi-webhook

| Aspek            | Singleton (lama)           | Multi-webhook (baru)               |
| ---------------- | -------------------------- | ---------------------------------- |
| Consumer         | 1 — Finance Core saja      | N — siapapun bisa subscribe        |
| Tambah consumer  | Perlu ganti env + redeploy | INSERT ke tabel, langsung aktif    |
| Gagal 1 consumer | Blok semua                 | Independent, yang lain tetap jalan |
| Observability    | 1 log                      | Per-subscriber delivery log        |
| Event filtering  | Tidak ada                  | Per-subscriber event type filter   |
| Model referensi  | -                          | GitHub/Stripe/Clerk webhooks       |

---

_Document ini hidup. Update saat Finance Core planning dimulai._
