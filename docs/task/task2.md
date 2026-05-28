# Task 2: Monthly Report Auto-Scheduler + Balance Carry-Forward

## Overview

Membangun sistem laporan keuangan bulanan otomatis yang:

1. Dijalankan secara otomatis setiap tanggal 1 bulan baru (scheduler via BullMQ repeatable job)
2. Menghitung saldo bersih bulan lalu dan membawanya ke bulan berikutnya (carry-forward balance)
3. Mengirimkan ringkasan laporan bulanan ke WhatsApp user
4. Menyimpan snapshot laporan di tabel `reports` untuk referensi historis

## Desain yang Disepakati

### Saldo Carry-Forward

- **Tidak perlu tabel baru** — cukup extend `ReportData` dan tabel `reports`
- Tambahkan kolom `openingBalance` dan `closingBalance` ke `reports` table (atau ke `ReportData` jsonb)
- Formula: `closingBalance = openingBalance + totalIncome - totalExpense`
- Bulan berikutnya: `openingBalance = closingBalance bulan sebelumnya`
- Bulan pertama user: `openingBalance = 0`

### Auto-Scheduler

- Gunakan **BullMQ Repeatable Job** (sudah ada di project, tidak perlu library baru)
- Cron expression: `0 7 1 * *` (setiap tanggal 1, jam 07:00 pagi timezone user)
- Processor baru: `monthly-report.processor.ts`

---

## Checklist Implementasi

### 1. Database Schema

- [ ] Extend `ReportData` interface di `packages/db/src/schema/reports.ts`:
  - Tambahkan field `openingBalance: number`
  - Tambahkan field `closingBalance: number`
- [ ] Generate & apply migrasi baru (`pnpm db:generate && pnpm db:migrate`)

### 2. Shared Constants

- [ ] Tambahkan `JobName.GENERATE_MONTHLY_REPORT` di `packages/shared/src/index.ts`
- [ ] Tambahkan `QueueName.MONTHLY_REPORT` (atau gunakan queue `report-generation` yang sudah ada)

### 3. Scheduler — Daftarkan Repeatable Job

- [ ] Di `apps/worker/src/worker.module.ts` (atau entry point worker), daftarkan BullMQ repeatable job:
  ```typescript
  await enqueue(QueueName.REPORT, JobName.GENERATE_MONTHLY_REPORT, payload, {
    repeat: { cron: "0 7 1 * *", tz: "Asia/Jakarta" },
  });
  ```
- [ ] Pastikan job hanya terdaftar sekali (idempotent — cek dulu sebelum register)

### 4. Processor Baru: `monthly-report.processor.ts`

- [ ] Buat file `apps/worker/src/processors/monthly-report.processor.ts`
- [ ] Logic utama:
  1. Ambil semua user aktif dari DB
  2. Untuk setiap user:
     a. Tentukan periode: bulan lalu (dari tanggal 1 s.d. akhir bulan)
     b. Cari `closingBalance` dari laporan bulan sebelumnya → jadikan `openingBalance`
     c. Hitung `totalIncome`, `totalExpense`, `totalTransfer` dari tabel `transactions`
     d. Hitung `closingBalance = openingBalance + totalIncome - totalExpense`
     e. Generate breakdown per kategori (top 5 expense categories)
     f. Minta AI insight (summary 1-2 kalimat) via `SumopodProvider.generateSummary()`
     g. Simpan ke tabel `reports` (dengan `sentAt = null` dulu)
     h. Format pesan WhatsApp laporan bulanan
     i. Kirim ke WA user via `enqueue(WA_SENDER, ...)`
     j. Update `sentAt` di tabel `reports`
- [ ] Handle kasus user baru (openingBalance = 0, belum ada transaksi sebelumnya)
- [ ] Handle kasus tidak ada transaksi di bulan tersebut (kirim notif "bulan ini tidak ada transaksi")

### 5. Integrasi ke Worker Module

- [ ] Register `MonthlyReportProcessor` di `apps/worker/src/worker.module.ts`

### 6. Format Pesan WhatsApp

Contoh format yang diinginkan:

```
📊 Laporan Keuangan Bulanan — April 2025

💰 Saldo Awal: Rp 1.000.000
➕ Total Pemasukan: Rp 5.000.000
➖ Total Pengeluaran: Rp 3.200.000
💳 Total Transfer: Rp 500.000
✅ Saldo Akhir: Rp 2.800.000

📂 Top Pengeluaran:
• Makanan & Minuman — Rp 1.200.000 (37%)
• Transportasi — Rp 800.000 (25%)
• Tagihan & Utilitas — Rp 600.000 (18%)

💡 Insight: Pengeluaran kamu bulan ini terbilang terkendali! Kategori makanan mendominasi — mungkin bisa coba masak di rumah lebih sering bulan depan 😄
```

### 7. Manual Trigger (Opsional)

- [ ] Support trigger manual via command WA `/laporan bulan` agar user bisa minta laporan kapan saja tanpa menunggu jadwal otomatis
  > Catatan: Ini mungkin sudah sebagian handled oleh `report.processor.ts` yang ada. Cek overlap!

---

## Catatan Teknis

- **Timezone**: Scheduler harus aware timezone per-user. Untuk awal bisa default `Asia/Jakarta`, nanti bisa dinamis.
- **Idempotency**: Cek apakah report bulan tersebut sudah ada di DB sebelum generate ulang, hindari duplikat.
- **Budgeting**: Fitur budgeting (batas pengeluaran per kategori) **tidak termasuk di task ini** — akan jadi Task 3 tersendiri.
- **Tabel `reports`**: Sudah ada, schema sudah benar. Hanya perlu extend `ReportData` interface saja.
