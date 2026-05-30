# Task 4: Fitur User-Facing Lanjutan

## Overview

Kumpulan fitur user-facing yang meningkatkan pengalaman penggunaan FinCore via WhatsApp. Task ini mencakup:

1. **Manajemen Transaksi** — edit, hapus, dan konfirmasi transaksi via WA
2. **Query Keuangan Cerdas (Natural Language)** — tanya saldo, riwayat, analisis via chat
3. **Custom Payment Method & Kategori** — user bisa tambah sendiri
4. **Pengaturan User** — timezone, preferensi laporan, dll
5. **Onboarding** — flow untuk user baru pertama kali kirim pesan

---

## Sub-Task 4A: Manajemen Transaksi via WA

### Overview

User sering salah catat dan ingin hapus atau edit transaksi terakhir.

### Checklist

- [ ] **Hapus transaksi terakhir**: Command `/hapus` atau `/hapus terakhir`
  - Soft delete transaksi paling terakhir milik user
  - Konfirmasi sebelum hapus: tampilkan detail transaksi dulu, minta konfirmasi "Ya / Tidak"
  - Gunakan state management sederhana (simpan `pendingAction` di Redis/Valkey dengan TTL 5 menit)
- [ ] **Hapus transaksi spesifik**: `/hapus [nama/tanggal]`
  - Fuzzy search berdasarkan nama atau tanggal
  - Tampilkan maksimal 5 kandidat, minta user pilih nomor
- [ ] **Konfirmasi transaksi**: Command `/konfirmasi` untuk transaksi dengan `isConfirmed = false`
  - Tampilkan daftar transaksi yang pending konfirmasi (confidence < 0.5)
  - User bisa konfirmasi satu per satu atau semua
- [ ] **Edit transaksi** (phase 2 — complex):
  - `/edit [field] [nilai]` pada transaksi terakhir
  - Contoh: `/edit nominal 50000` atau `/edit kategori transport`

### State Management untuk Konfirmasi

- Simpan `{ action: 'confirm_delete', transactionId: '...', userId: '...' }` di Valkey dengan key `fincore:pending:{userId}` dan TTL 5 menit
- Di webhook handler, sebelum proses pesan biasa, cek dulu apakah ada pending action untuk user tersebut

---

## Sub-Task 4B: Query Keuangan Natural Language

### Overview

User bisa tanya langsung via chat dalam bahasa natural, bukan hanya command kaku.

### Contoh Pertanyaan yang Didukung

- "Berapa total pengeluaranku minggu ini?"
- "Pengeluaran terbesar bulan ini apa?"
- "Sisa saldo ku berapa?"
- "Sudah berapa yang ku belanjakan untuk kategori makanan?"
- "Kirim laporan harian dong"

### Checklist

- [ ] Extend `FinanceGuardrail` atau buat `QueryParser` terpisah
  - Input: teks natural dari user
  - Output: structured query `{ type: 'balance' | 'spending' | 'report' | ..., period: ..., categorySlug?: ... }`
- [ ] Integrasikan dengan AI (Sumopod/Gemini) untuk parse intent
- [ ] Handler baru di `report.processor.ts` atau query processor baru
- [ ] Return response yang ringkas dan human-friendly

### Catatan

- **Overlap dengan `report.processor.ts`**: Banyak logika query sudah ada di sini. Audit dulu sebelum buat ulang.
- Gunakan cache: kalau query sama dalam 1 jam → return dari `reports` table daripada recompute.

---

## Sub-Task 4C: Custom Payment Method & Kategori

### Overview

User bisa tambah payment method pribadi (misal: "BCA Tabungan", "Dana Bisnis") dan kategori custom.

### Checklist

- [ ] **Tambah payment method custom**:
  - Command: `/tambah metode [nama]`
  - Contoh: `/tambah metode BCA Tabungan`
  - Simpan ke tabel `payment_methods` dengan `userId` diisi
  - Langsung tersedia di context AI extraction berikutnya
- [ ] **Tambah kategori custom**:
  - Command: `/tambah kategori [nama] [expense|income]`
  - Contoh: `/tambah kategori Langganan Streaming expense`
  - Simpan ke `transaction_categories` dengan `userId` diisi dan `slug` di-generate otomatis
- [ ] **Lihat daftar** metode/kategori:
  - `/lihat metode` — tampilkan semua payment method (global + custom user)
  - `/lihat kategori` — tampilkan semua kategori per type

### Integrasi dengan AI Extraction Context

- Di `ai-extraction.processor.ts`, saat fetch context untuk AI, sudah include payment methods dan kategori custom user
- Pastikan query ambil `userId IS NULL OR userId = currentUserId`

---

## Sub-Task 4D: Pengaturan User (Settings)

### Overview

User bisa atur preferensi pribadi.

### Checklist

- [ ] **Extend tabel `users`** dengan kolom baru (generate migrasi):
  - `reportSchedule`: `text` DEFAULT `'monthly'` — `'daily' | 'weekly' | 'monthly' | 'off'`
  - `reportTime`: `text` DEFAULT `'07:00'` — jam pengiriman laporan otomatis
  - `preferredCurrency`: `text` DEFAULT `'IDR'`
  - `onboardedAt`: `timestamp` nullable — null berarti belum pernah onboarding
- [ ] **Command pengaturan**:
  - `/atur timezone [Asia/Jakarta]`
  - `/atur laporan [daily|weekly|monthly|off]`
  - `/atur jam [07:00]`
- [ ] **Simpan & apply** perubahan setting segera

---

## Sub-Task 4E: Onboarding User Baru

### Overview

Saat user pertama kali kirim pesan ke FinCore (belum ada di tabel `users`), sistem harus memberi sambutan dan penjelasan singkat.

### Checklist

- [ ] Di `webhook.service.ts`, saat user baru register (insert ke tabel `users`), langsung:
  1. Set `onboardedAt = null` (belum onboarding)
  2. Enqueue job `ONBOARDING` atau langsung kirim balasan
- [ ] Pesan sambutan berisi:

  ```
  Halo! Selamat datang di *FinCore* 🎉

  Saya asisten keuangan pribadimu via WhatsApp.

  Berikut cara menggunakannya:
  💬 Ketik transaksi: "Makan siang 35rb GoPay"
  🎤 Kirim voice note: "Tadi bayar bensin 50 ribu"
  📸 Foto struk belanja dan kirimkan ke sini

  Ketik /bantuan untuk panduan lengkap.

  Yuk mulai catat keuanganmu! 💪
  ```

- [ ] Set `onboardedAt = now()` setelah pesan terkirim

---

## Prioritas Pengerjaan

| Sub-Task                             | Prioritas | Kompleksitas | Keterangan                              |
| ------------------------------------ | --------- | ------------ | --------------------------------------- |
| **4E - Onboarding**                  | 🔴 Tinggi | Rendah       | Quick win, user experience pertama kali |
| **4A - Manajemen Transaksi (hapus)** | 🔴 Tinggi | Sedang       | Fitur yang paling sering dibutuhkan     |
| **4B - Natural Language Query**      | 🟡 Sedang | Tinggi       | Banyak overlap dengan kode yang ada     |
| **4C - Custom PM & Kategori**        | 🟡 Sedang | Sedang       | Berguna untuk personalisasi             |
| **4D - Pengaturan User**             | 🟢 Rendah | Rendah       | Nice to have, bisa dikerjakan terakhir  |

---

## Catatan Teknis Umum

- **State Machine**: Sub-task 4A membutuhkan state management percakapan (multi-turn conversation). Gunakan Valkey dengan TTL untuk menyimpan state sementara.
- **Command Prefix**: Semua command sudah menggunakan `FINCORE_TRIGGER_PREFIX` dari env (sudah diimplementasi).
- **Idempotency**: Pastikan setiap handler cek dulu apakah aksi sudah pernah dilakukan sebelum eksekusi.
- **Error Handling**: Setiap command yang gagal harus balas ke user dengan pesan error yang ramah, bukan diam saja.
