# TASK: Generate Complete Drizzle ORM Schema for FinCore

## Context

Kamu adalah senior backend engineer yang ahli dalam Drizzle ORM, PostgreSQL, dan sistem keuangan personal. Kamu sedang membangun schema database untuk **FinCore** — platform pencatatan keuangan personal berbasis WhatsApp yang memproses input multimodal (text, voice, image) menggunakan AI.

---

## Tech Stack

- **ORM:** Drizzle ORM (drizzle-orm v0.36+)
- **Database:** PostgreSQL 16
- **Runtime:** Node.js / TypeScript
- **Package name:** `@fincore/db`
- **File output:** `packages/db/src/schema/`

---

## Project Structure Output

Generate file-file berikut dalam folder `packages/db/src/schema/`:

```
schema/
├── enums.ts              ← semua pgEnum terpusat di sini
├── users.ts
├── payment-methods.ts
├── raw-messages.ts
├── raw-transcriptions.ts
├── raw-ocr-results.ts
├── raw-ai-outputs.ts
├── transaction-categories.ts
├── transactions.ts
├── transaction-tags.ts
├── transaction-tag-mappings.ts
├── reports.ts
├── ai-processing-logs.ts
└── index.ts              ← re-export semua + seed data categories
```

---

## Rules & Conventions

### Drizzle Conventions

- Semua PK: `uuid('id').primaryKey().defaultRandom()`
- `created_at`: `timestamp('created_at').defaultNow().notNull()`
- `updated_at`: `timestamp('updated_at').defaultNow().notNull().$onUpdateFn(() => new Date())`
- FK selalu gunakan `.references(() => table.column, { onDelete: 'cascade' })` kecuali disebutkan lain
- Column JS name: camelCase → DB name: snake_case
- Gunakan `index()` dari `drizzle-orm/pg-core` untuk semua kolom yang sering di-query
- Semua enum didefinisikan di `enums.ts`, tidak boleh ada enum di file tabel lain
- Export type: `typeof table.$inferSelect` dan `typeof table.$inferInsert`

### Import Pattern

```ts
import { pgTable, uuid, text, timestamp, numeric, ... } from 'drizzle-orm/pg-core';
import { index } from 'drizzle-orm/pg-core';
import { someEnum } from './enums';
import { users } from './users';
```

---

## Detailed Schema Requirements

---

### FILE: enums.ts

Definisikan semua enum berikut:

```
messageTypeEnum       → 'text' | 'voice' | 'image' | 'document' | 'video'
processingStatusEnum  → 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
transactionTypeEnum   → 'expense' | 'income' | 'transfer'
reportTypeEnum        → 'daily' | 'weekly' | 'monthly' | 'custom'
paymentMethodTypeEnum → 'cash' | 'e_wallet' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'qris' | 'other'
processingStepEnum    → 'transcription' | 'ocr' | 'ai_extraction' | 'categorization' | 'notification'
```

---

### FILE: users.ts

Kolom:

- `id` uuid PK
- `phone` text UNIQUE NOT NULL (format: 628xxxxxxxxxx)
- `name` text nullable
- `timezone` text default `'Asia/Jakarta'`
- `isActive` boolean default `true` NOT NULL
- `created_at`, `updated_at`

Index: phone

---

### FILE: payment-methods.ts

**Purpose:** Reference table untuk metode pembayaran. Seeded dengan data default, user bisa tambah custom.

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id nullable (NULL = global/default, ada userId = custom milik user tsb)
- `name` text NOT NULL (contoh: "GoPay", "BCA", "Tunai", "Dana", "OVO", "QRIS BNI")
- `type` paymentMethodTypeEnum NOT NULL
- `icon` text nullable (emoji atau icon identifier, contoh: "💳", "📱")
- `color` text nullable (hex color untuk UI)
- `isActive` boolean default `true` NOT NULL
- `created_at`

Index: userId, type

Seed data default (userId = NULL):

```
{ name: 'Tunai / Cash',     type: 'cash',          icon: '💵' }
{ name: 'GoPay',            type: 'e_wallet',       icon: '💚' }
{ name: 'OVO',              type: 'e_wallet',       icon: '💜' }
{ name: 'Dana',             type: 'e_wallet',       icon: '🔵' }
{ name: 'ShopeePay',        type: 'e_wallet',       icon: '🟠' }
{ name: 'LinkAja',          type: 'e_wallet',       icon: '🔴' }
{ name: 'QRIS',             type: 'qris',           icon: '📷' }
{ name: 'Transfer BCA',     type: 'bank_transfer',  icon: '🏦' }
{ name: 'Transfer BNI',     type: 'bank_transfer',  icon: '🏦' }
{ name: 'Transfer BRI',     type: 'bank_transfer',  icon: '🏦' }
{ name: 'Transfer Mandiri', type: 'bank_transfer',  icon: '🏦' }
{ name: 'Kartu Kredit',     type: 'credit_card',    icon: '💳' }
{ name: 'Kartu Debit',      type: 'debit_card',     icon: '💳' }
```

---

### FILE: raw-messages.ts

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id nullable (nullable karena user mungkin belum register saat message masuk)
- `waMessageId` text UNIQUE NOT NULL (ID dari WAHA webhook)
- `from` text NOT NULL (nomor WA pengirim)
- `type` messageTypeEnum NOT NULL
- `body` text nullable (isi teks pesan)
- `mediaUrl` text nullable (URL media dari WAHA)
- `mediaMimetype` text nullable
- `mediaSize` integer nullable (bytes)
- `rawPayload` jsonb NOT NULL (full webhook payload, jangan pernah trim)
- `processingStatus` processingStatusEnum default `'pending'` NOT NULL
- `processingError` text nullable
- `retryCount` integer default `0` NOT NULL
- `receivedAt` timestamp NOT NULL (waktu dari webhook, bukan defaultNow)
- `processedAt` timestamp nullable
- `created_at`

Index: userId, processingStatus, receivedAt, waMessageId

---

### FILE: raw-transcriptions.ts

Purpose: Menyimpan hasil Groq Whisper transcription dari voice note. Disimpan raw agar bisa reprocess.

Kolom:

- `id` uuid PK
- `rawMessageId` uuid FK → raw_messages.id NOT NULL
- `transcript` text NOT NULL
- `language` text default `'id'` NOT NULL
- `durationSeconds` real nullable
- `provider` text NOT NULL (contoh: 'groq-whisper-large-v3')
- `modelVersion` text nullable
- `created_at`

Index: rawMessageId

---

### FILE: raw-ocr-results.ts

Purpose: Menyimpan hasil Gemini Vision OCR dari gambar. Disimpan raw.

Kolom:

- `id` uuid PK
- `rawMessageId` uuid FK → raw_messages.id NOT NULL
- `extractedText` text NOT NULL
- `provider` text NOT NULL (contoh: 'gemini-1.5-flash')
- `confidence` real nullable (0.0–1.0)
- `rawResponse` jsonb nullable (full response dari provider, untuk debug)
- `created_at`

Index: rawMessageId

---

### FILE: raw-ai-outputs.ts

Purpose: Menyimpan semua input/output AI extraction. Krusial untuk debugging, prompt improvement, reprocessing.

Kolom:

- `id` uuid PK
- `rawMessageId` uuid FK → raw_messages.id NOT NULL
- `prompt` text NOT NULL (prompt yang dikirim ke AI)
- `response` text NOT NULL (raw response dari AI)
- `parsedOutput` jsonb nullable (hasil parsing JSON dari response)
- `provider` text NOT NULL (contoh: 'sumopod')
- `model` text NOT NULL (contoh: 'gpt-4o-mini')
- `inputTokens` integer nullable
- `outputTokens` integer nullable
- `latencyMs` integer nullable
- `isValid` boolean default `false` NOT NULL (apakah parsing berhasil)
- `created_at`

Index: rawMessageId, provider

---

### FILE: transaction-categories.ts

Purpose: Reference table kategori transaksi. Dibedakan per transactionType karena kategori income ≠ expense.

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id nullable (NULL = global default, ada userId = custom)
- `name` text NOT NULL
- `slug` text NOT NULL (contoh: 'food', 'transport', 'salary')
- `type` transactionTypeEnum NOT NULL (kategori ini untuk expense, income, atau transfer?)
- `icon` text nullable (emoji)
- `color` text nullable (hex)
- `isDefault` boolean default `false` NOT NULL
- `isActive` boolean default `true` NOT NULL
- `sortOrder` integer default `0` NOT NULL
- `created_at`

UNIQUE constraint: (slug, userId) — slug unik per user (atau global jika userId null)

Index: type, userId, isDefault

Seed data default (userId = NULL):

**Expense categories:**

```
{ name: 'Makanan & Minuman', slug: 'food',           type: 'expense', icon: '🍔', isDefault: true }
{ name: 'Transportasi',      slug: 'transport',       type: 'expense', icon: '🚗', isDefault: true }
{ name: 'Belanja',           slug: 'shopping',        type: 'expense', icon: '🛍️', isDefault: true }
{ name: 'Kesehatan',         slug: 'health',          type: 'expense', icon: '💊', isDefault: true }
{ name: 'Hiburan',           slug: 'entertainment',   type: 'expense', icon: '🎮', isDefault: true }
{ name: 'Tagihan & Utilitas',slug: 'bills',           type: 'expense', icon: '📄', isDefault: true }
{ name: 'Pendidikan',        slug: 'education',       type: 'expense', icon: '📚', isDefault: true }
{ name: 'Investasi',         slug: 'investment_out',  type: 'expense', icon: '📈', isDefault: true }
{ name: 'Perawatan Diri',    slug: 'personal_care',   type: 'expense', icon: '💆', isDefault: true }
{ name: 'Rumah Tangga',      slug: 'household',       type: 'expense', icon: '🏠', isDefault: true }
{ name: 'Lainnya',           slug: 'other_expense',   type: 'expense', icon: '📦', isDefault: true }
```

**Income categories:**

```
{ name: 'Gaji',              slug: 'salary',          type: 'income', icon: '💰', isDefault: true }
{ name: 'Freelance',         slug: 'freelance',       type: 'income', icon: '💻', isDefault: true }
{ name: 'Bisnis',            slug: 'business',        type: 'income', icon: '🏪', isDefault: true }
{ name: 'Investasi',         slug: 'investment_in',   type: 'income', icon: '📊', isDefault: true }
{ name: 'Bonus',             slug: 'bonus',           type: 'income', icon: '🎁', isDefault: true }
{ name: 'Hadiah / Hibah',    slug: 'gift',            type: 'income', icon: '🎀', isDefault: true }
{ name: 'Hasil Jual',        slug: 'selling',         type: 'income', icon: '🏷️', isDefault: true }
{ name: 'Lainnya',           slug: 'other_income',    type: 'income', icon: '📦', isDefault: true }
```

**Transfer categories:**

```
{ name: 'Transfer Antar Rekening', slug: 'transfer_account', type: 'transfer', icon: '🔄', isDefault: true }
{ name: 'Top Up E-Wallet',         slug: 'topup_ewallet',    type: 'transfer', icon: '📲', isDefault: true }
{ name: 'Bayar Utang',             slug: 'pay_debt',         type: 'transfer', icon: '🤝', isDefault: true }
{ name: 'Beri Pinjaman',           slug: 'give_loan',        type: 'transfer', icon: '🤲', isDefault: true }
```

---

### FILE: transactions.ts

Purpose: Tabel utama transaksi yang sudah dinormalisasi oleh AI.

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id NOT NULL
- `rawMessageId` uuid FK → raw_messages.id nullable, onDelete: SET NULL
- `categoryId` uuid FK → transaction_categories.id nullable
- `paymentMethodId` uuid FK → payment_methods.id nullable (sumber dana / metode bayar keluar)
- `toPaymentMethodId` uuid FK → payment_methods.id nullable, onDelete: SET NULL
  → Khusus untuk type `transfer`: rekening/wallet tujuan (contoh: Bank Jago)
  → NULL untuk type `expense` dan `income`
- `type` transactionTypeEnum NOT NULL
- `amount` numeric(15, 2) NOT NULL
  → Selalu positif. Untuk transfer: nominal yang dikirim ke tujuan (bukan total keluar)
- `fee` numeric(15, 2) default `'0'` NOT NULL
  → Biaya admin / transfer fee. Default 0.
  → Contoh: transfer antar bank kena Rp 2.500 → fee = 2500
- `totalAmount` numeric(15, 2) NOT NULL
  → Stored computed: amount + fee. Redundant tapi mempermudah query & report.
  → Untuk expense/income: sama dengan amount (fee = 0)
  → Untuk transfer: total yang benar-benar keluar dari sumber (amount + fee)
- `feeNote` text nullable
  → Keterangan biaya tambahan (contoh: "biaya transfer beda bank", "admin bulanan")
- `currency` text default `'IDR'` NOT NULL
- `merchant` text nullable
- `location` text nullable
- `notes` text nullable
- `sourceType` messageTypeEnum NOT NULL (dari mana asalnya: text/voice/image)
- `confidenceScore` real nullable (0.0–1.0, dari AI extraction)
- `isConfirmed` boolean default `true` NOT NULL (false jika confidence < 0.5, butuh review)
- `isDeleted` boolean default `false` NOT NULL (soft delete)
- `transactionDate` timestamp NOT NULL (waktu transaksi terjadi, bisa berbeda dari createdAt)
- `created_at`, `updated_at`

**Business Rules untuk field ini (wajib dicantumkan di JSDoc):**

- `totalAmount` HARUS selalu = `amount + fee`. Validasi ini ada di application layer sebelum insert.
- `toPaymentMethodId` WAJIB diisi jika `type = 'transfer'`, HARUS null jika `type = 'expense'` atau `'income'`.
- `fee` tidak boleh negatif.
- `amount` tidak boleh 0 atau negatif.

Index: (userId, transactionDate DESC), (userId, type), categoryId, paymentMethodId, toPaymentMethodId, isDeleted, isConfirmed

---

### FILE: transaction-tags.ts

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id NOT NULL
- `name` text NOT NULL
- `color` text nullable
- `created_at`

UNIQUE constraint: (userId, name)
Index: userId

---

### FILE: transaction-tag-mappings.ts

Kolom:

- `id` uuid PK
- `transactionId` uuid FK → transactions.id NOT NULL, onDelete: cascade
- `tagId` uuid FK → transaction_tags.id NOT NULL, onDelete: cascade
- `created_at`

UNIQUE constraint: (transactionId, tagId)
Index: transactionId, tagId

---

### FILE: reports.ts

Purpose: Menyimpan laporan yang sudah di-generate agar tidak recompute setiap kali.

Kolom:

- `id` uuid PK
- `userId` uuid FK → users.id NOT NULL
- `type` reportTypeEnum NOT NULL
- `periodStart` timestamp NOT NULL
- `periodEnd` timestamp NOT NULL
- `summary` text nullable (teks laporan yang dikirim ke WhatsApp)
- `data` jsonb NOT NULL (raw data laporan: breakdown, totals, dll)
- `sentAt` timestamp nullable (kapan dikirim ke WA, null = belum dikirim)
- `created_at`

Index: (userId, type, periodStart DESC)

---

### FILE: ai-processing-logs.ts

Purpose: Audit trail setiap step pemrosesan AI per message. Berguna untuk debugging bottleneck dan failure.

Kolom:

- `id` uuid PK
- `rawMessageId` uuid FK → raw_messages.id NOT NULL
- `step` processingStepEnum NOT NULL
- `status` processingStatusEnum NOT NULL
- `provider` text nullable (nama provider yang dipakai di step ini)
- `durationMs` integer nullable (berapa lama step ini berjalan)
- `inputSnapshot` jsonb nullable (input step ini, untuk debug)
- `outputSnapshot` jsonb nullable (output step ini, untuk debug)
- `error` text nullable (error message jika gagal)
- `created_at`

Index: rawMessageId, step, status

---

### FILE: index.ts

Export semua table dan type. Juga export konstanta seed data untuk:

- `DEFAULT_PAYMENT_METHODS` — array of NewPaymentMethod untuk seeding
- `DEFAULT_TRANSACTION_CATEGORIES` — array of NewTransactionCategory untuk seeding

Format seed export:

```ts
export const DEFAULT_PAYMENT_METHODS: Omit<NewPaymentMethod, 'id'>[] = [ ... ]
export const DEFAULT_TRANSACTION_CATEGORIES: Omit<NewTransactionCategory, 'id'>[] = [ ... ]
```

---

## Additional Requirements

1. **Tidak ada `whatsapp_sessions` table** — ini personal use dengan 1 nomor fixed. Session dikelola via WAHA env config.

2. **Semua tabel harus ada JSDoc comment** di atas `pgTable(...)` yang menjelaskan purpose tabel.

3. **Gunakan `.$onUpdateFn(() => new Date())`** untuk semua kolom `updated_at`.

4. **Tidak ada circular imports** — urutan import: enums → users → payment-methods → transaction-categories → raw-messages → raw-transcriptions/ocr/ai-outputs → transactions → transaction-tags → transaction-tag-mappings → reports → ai-processing-logs.

5. **Semua index diberi nama eksplisit** menggunakan parameter kedua `.name('idx_tablename_column')`.

6. **Gunakan `.$type<T>()` untuk jsonb** agar type-safe:
   - `rawPayload` di raw_messages: `.$type<Record<string, unknown>>()`
   - `data` di reports: `.$type<ReportData>()`
   - `parsedOutput` di raw_ai_outputs: `.$type<AiExtractionOutput | null>()`

7. **Export interface** `ReportData` dan gunakan sebagai type untuk `reports.data` jsonb.

8. **`totalAmount` tidak di-compute di DB** — tidak pakai generated column. Dihitung di application layer sebelum insert, lalu disimpan as-is. Alasannya: lebih portable, mudah di-override manual jika ada koreksi.

9. **Untuk `toPaymentMethodId`**, gunakan named FK berbeda dari `paymentMethodId` agar tidak konflik di Drizzle relation:
   ```ts
   paymentMethodId: uuid('payment_method_id')
     .references(() => paymentMethods.id, { onDelete: 'set null' }),
   toPaymentMethodId: uuid('to_payment_method_id')
     .references(() => paymentMethods.id, { onDelete: 'set null' }),
   ```

---

## AI Extraction Contract Update

Update `AiExtractionOutputSchema` di `packages/contracts/src/index.ts` untuk support field transfer fee.

Field baru yang perlu ditambahkan ke `AiExtractionOutputSchema`:

```ts
fee: z.number().min(0).default(0),
// ↑ biaya admin/transfer. Default 0 jika tidak disebutkan user.

total_amount: z.number().min(0),
// ↑ amount + fee. AI harus hitung ini. Jika fee tidak ada, total_amount = amount.

to_payment_method: z.string().optional(),
// ↑ nama metode tujuan untuk transfer (contoh: "Bank Jago", "OVO").
//   Null/undefined untuk expense dan income.

fee_note: z.string().optional(),
// ↑ keterangan biaya (contoh: "biaya transfer beda bank").
```

**Contoh AI extraction output untuk transfer dengan fee:**

```json
{
  "type": "transfer",
  "amount": 500000,
  "fee": 2500,
  "total_amount": 502500,
  "currency": "IDR",
  "category": "transfer_account",
  "payment_method": "BSI",
  "to_payment_method": "Bank Jago",
  "fee_note": "biaya transfer beda bank",
  "source_type": "text",
  "confidence_score": 0.95
}
```

**Contoh AI extraction output untuk expense biasa (fee = 0):**

```json
{
  "type": "expense",
  "amount": 25000,
  "fee": 0,
  "total_amount": 25000,
  "currency": "IDR",
  "category": "food",
  "payment_method": "GoPay",
  "to_payment_method": null,
  "source_type": "text",
  "confidence_score": 0.92
}
```

**Validation rule di Zod (tambahkan `.refine()`):**

```ts
AiExtractionOutputSchema.refine(
  (data) => data.total_amount === data.amount + data.fee,
  { message: "total_amount harus sama dengan amount + fee" },
).refine((data) => data.type !== "transfer" || !!data.to_payment_method, {
  message: "to_payment_method wajib diisi untuk type transfer",
});
```

---

## Transfer Seed Categories Update

Tambahkan kategori transfer berikut ke seed data (melengkapi yang sudah ada):

```
{ name: 'Transfer + Fee Admin',   slug: 'transfer_with_fee',  type: 'transfer', icon: '💸', isDefault: true }
```

---

## Expected Output

Generate semua file TypeScript yang siap dipakai, tidak ada placeholder, tidak ada TODO, semua field lengkap persis seperti yang dispesifikasikan di atas.

Setiap file harus bisa langsung dipakai tanpa modifikasi untuk `drizzle-kit generate`.
