# Task 3: Budgeting — Batas Pengeluaran per Kategori per Bulan

## Overview

Membangun fitur budgeting yang memungkinkan user menetapkan batas pengeluaran per kategori per bulan melalui WhatsApp. Sistem akan memberikan notifikasi otomatis saat pengeluaran mendekati atau melampaui batas yang ditetapkan.

---

## Desain yang Disepakati

### Tabel Baru: `budgets`

Diperlukan tabel tersendiri karena budget adalah entitas yang berbeda dari laporan:

- **Report** = rekap aktual yang sudah terjadi
- **Budget** = target/batas yang ditetapkan user di muka

### Kapan Notifikasi Dikirim?

1. **Saat transaksi masuk** — cek apakah pengeluaran kategori tersebut di bulan ini sudah ≥ 80% budget → kirim warning
2. **Saat melampaui budget** — kirim notifikasi langsung saat transaksi masuk dan total sudah > 100%
3. **Di awal bulan** — kirim rekap sisa budget bulan baru (bisa dikombinasi dengan monthly report)

---

## Checklist Implementasi

### 1. Database Schema — Tabel `budgets`

- [ ] Buat file `packages/db/src/schema/budgets.ts` dengan kolom:
  ```typescript
  id: uuid PK
  userId: uuid FK → users.id, onDelete: cascade
  categoryId: uuid FK → transaction_categories.id, onDelete: cascade
  amount: numeric(15, 2) NOT NULL          // batas pengeluaran
  currency: text DEFAULT 'IDR'
  month: integer NOT NULL                  // 1-12
  year: integer NOT NULL                   // contoh: 2025
  isActive: boolean DEFAULT true
  notes: text nullable
  createdAt, updatedAt
  ```
  UNIQUE constraint: `(userId, categoryId, month, year)`
- [ ] Export type `Budget` dan `NewBudget`
- [ ] Tambahkan ke `packages/db/src/schema/index.ts`
- [ ] Generate & apply migrasi (`pnpm db:generate && pnpm db:push`)

### 2. Shared Constants

- [ ] Tambahkan `JobName.CHECK_BUDGET` di `packages/shared/src/index.ts`
- [ ] Tambahkan `QueueName.BUDGET_CHECK` (atau gunakan existing queue)

### 3. Budget Check Processor

- [ ] Buat `apps/worker/src/processors/budget-check.processor.ts`
- [ ] Logic:
  1. Trigger dipanggil setelah setiap transaksi expense berhasil disimpan (dari `ai-extraction.processor.ts`)
  2. Ambil `categoryId` dan `userId` dari transaksi
  3. Cari budget aktif untuk kategori + bulan/tahun saat ini
  4. Jika tidak ada budget → skip
  5. Hitung total pengeluaran kategori tersebut di bulan ini dari tabel `transactions`
  6. Hitung persentase: `(totalSpent / budgetAmount) * 100`
  7. Kirim notifikasi jika:
     - `>= 80%` dan `< 100%`: warning "Mendekati batas budget"
     - `>= 100%`: alert "Budget terlampaui!"
  8. Hindari spam: cek apakah notifikasi sudah pernah dikirim di bulan yang sama (simpan flag di DB atau cek log)

### 4. Integrasi ke AI Extraction Processor

- [ ] Di `apps/worker/src/processors/ai-extraction.processor.ts`, setelah transaksi berhasil disimpan dan typenya `expense`, enqueue job `CHECK_BUDGET` dengan payload:
  ```typescript
  {
    (userId, categoryId, transactionId, from);
  }
  ```

### 5. Command WA untuk Manage Budget

- [ ] Di `apps/api/src/modules/webhook/webhook.service.ts`, handle command baru:
  - `/budget set [kategori] [nominal]` → set budget bulanan untuk kategori
  - `/budget cek` → tampilkan status semua budget bulan ini
  - `/budget hapus [kategori]` → hapus budget untuk kategori
- [ ] Buat `budget.processor.ts` atau tambahkan handler di report.processor.ts untuk parse command ini

### 6. Format Pesan WhatsApp — Budget Status

Contoh reply `/budget cek`:

```
📊 Status Budget Bulan Mei 2025

🍔 Makanan & Minuman
   Terpakai: Rp 850.000 / Rp 1.000.000 (85%) ⚠️

🚗 Transportasi
   Terpakai: Rp 200.000 / Rp 500.000 (40%) ✅

🛍️ Belanja
   Terpakai: Rp 620.000 / Rp 600.000 (103%) 🚨 MELAMPAUI!
```

Contoh notifikasi otomatis saat 80%:

```
⚠️ Peringatan Budget!

Pengeluaran kamu untuk kategori *Makanan & Minuman* sudah mencapai 85% dari budget bulan ini.
Budget: Rp 1.000.000 | Terpakai: Rp 850.000

Sisa: Rp 150.000
```

### 7. Integrasi dengan Monthly Report (Task 2)

- [ ] Di laporan bulanan, sertakan ringkasan budget vs aktual:
  ```
  📋 Ringkasan Budget:
  • 3 kategori dalam batas ✅
  • 1 kategori terlampaui 🚨
  ```

---

## Catatan Teknis

- **Spam Prevention**: Notifikasi budget 80% hanya dikirim sekali per bulan per kategori. Bisa gunakan kolom `lastWarningAt` atau cek `ai_processing_logs`.
- **Multi-currency**: Budget dalam IDR saja untuk sementara. Konversi bisa jadi enhancement berikutnya.
- **Command parsing**: Nama kategori bisa fuzzy match (misal "makan" → "Makanan & Minuman") menggunakan string similarity atau mapping slug.
- **Reset otomatis**: Budget berlaku per bulan secara otomatis — tidak perlu reset manual karena query selalu filter by `month` dan `year`.
