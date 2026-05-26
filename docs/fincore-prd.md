# Product Requirements Document (PRD)

## FinCore — AI-Native Finance Assistant via WhatsApp

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2025
**Author:** FinCore Engineering Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Target Users](#3-target-users)
4. [User Problems & Pain Points](#4-user-problems--pain-points)
5. [Product Goals & Success Metrics](#5-product-goals--success-metrics)
6. [Feature Requirements](#6-feature-requirements)
7. [User Stories](#7-user-stories)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Out of Scope](#9-out-of-scope)
10. [Assumptions & Constraints](#10-assumptions--constraints)
11. [Release Milestones](#11-release-milestones)

---

## 1. Executive Summary

FinCore adalah platform pencatatan keuangan personal berbasis WhatsApp yang memanfaatkan kecerdasan buatan untuk memproses input multimodal — teks, suara, gambar, dan screenshot — menjadi data transaksi terstruktur secara otomatis. Pengguna tidak perlu membuka aplikasi terpisah, mengisi form, atau mengingat format tertentu; cukup kirim pesan ke WhatsApp seperti biasa.

---

## 2. Product Vision

> **"Mencatat keuangan semudah chat WhatsApp."**

FinCore hadir untuk mengubah kebiasaan mencatat keuangan yang selama ini terasa berat dan memerlukan disiplin tinggi, menjadi sesuatu yang natural dan otomatis — karena dilakukan di platform yang sudah dipakai setiap hari.

### Positioning Statement

Untuk masyarakat Indonesia yang aktif menggunakan WhatsApp setiap hari, FinCore adalah asisten keuangan personal berbasis AI yang memahami bahasa informal Indonesia, menerima berbagai format input, dan mengubahnya menjadi laporan keuangan yang berguna — tanpa aplikasi tambahan, tanpa form rumit.

---

## 3. Target Users

### Primary User: "Reza" — Profesional Muda Urban

- **Usia:** 22–35 tahun
- **Profesi:** Karyawan swasta, freelancer, wirausaha kecil
- **Perilaku:** Aktif menggunakan GoPay/OVO/Dana/QRIS, sering belanja online, makan di luar
- **Pain Point:** Ingin kontrol keuangan tapi malas buka aplikasi finance terpisah
- **Ekspektasi:** Cepat, tidak ribet, paham bahasa sehari-hari

### Secondary User: "Ibu Sari" — Ibu Rumah Tangga

- **Usia:** 30–50 tahun
- **Perilaku:** Sering foto struk belanja, transaksi harian cash dan e-wallet
- **Pain Point:** Tidak familier dengan aplikasi keuangan kompleks
- **Ekspektasi:** Cukup foto struk, langsung tercatat

### Tertiary User: "Tim Finance UMKM"

- **Konteks:** Usaha kecil yang perlu tracking pengeluaran operasional sederhana
- **Ekspektasi:** Export laporan, ringkasan bulanan

---

## 4. User Problems & Pain Points

| #   | Masalah                                                                         | Severity |
| --- | ------------------------------------------------------------------------------- | -------- |
| 1   | Aplikasi keuangan terlalu rumit dan butuh effort tinggi untuk diisi setiap hari | High     |
| 2   | Lupa mencatat transaksi kecil (parkir, jajan, dll)                              | High     |
| 3   | Tidak ada yang proses struk fisik atau screenshot otomatis                      | High     |
| 4   | Laporan keuangan tidak mudah dipahami atau tidak relevan                        | Medium   |
| 5   | Harus buka aplikasi terpisah yang tidak dipakai sehari-hari                     | High     |
| 6   | Bahasa informal Indonesia tidak dipahami aplikasi lain                          | Medium   |
| 7   | Tidak ada reminder / notifikasi ringkas yang berguna                            | Low      |

---

## 5. Product Goals & Success Metrics

### Product Goals

| Goal          | Deskripsi                                                             |
| ------------- | --------------------------------------------------------------------- |
| **Adoption**  | Pengguna aktif mencatat minimal 3x per minggu via WhatsApp            |
| **Accuracy**  | AI extraction menghasilkan data yang benar ≥ 85% tanpa koreksi manual |
| **Retention** | Pengguna tetap aktif di bulan ke-3 ≥ 60%                              |
| **Delight**   | Pengalaman terasa natural, bukan seperti mengisi form                 |

### Key Metrics (KPIs)

| Metric                                 | Target MVP | Target 6 Bulan |
| -------------------------------------- | ---------- | -------------- |
| Daily Active Users (DAU)               | 50         | 500            |
| Transaksi tercatat per user per minggu | 5          | 10             |
| Extraction accuracy (AI)               | 80%        | 90%            |
| Waktu proses pesan → konfirmasi        | < 10 detik | < 5 detik      |
| Error rate worker                      | < 5%       | < 2%           |
| User retention (bulan ke-2)            | 50%        | 65%            |

---

## 6. Feature Requirements

### F1 — WhatsApp Input Processing

**F1.1 Text Message Processing**

- Sistem menerima pesan teks informal dalam Bahasa Indonesia
- Memahami slang keuangan: ceban (10k), gopek (500), 50rb, 1jt, dsb
- Memahami nama e-wallet: GoPay, OVO, Dana, QRIS, ShopeePay, Transfer
- Konfirmasi balik ke pengguna setelah berhasil dicatat

**F1.2 Voice Note Processing**

- Sistem menerima voice note dari WhatsApp (format ogg/opus)
- Melakukan transcription menggunakan Groq Whisper (Bahasa Indonesia)
- Hasil transcription diproses seperti text message
- Konfirmasi berisi teks hasil transcript + data yang diekstrak

**F1.3 Image / Screenshot Processing**

- Mendukung: struk belanja, screenshot QRIS, mutasi bank, invoice, nota tangan
- OCR menggunakan Gemini Vision untuk ekstrak teks dari gambar
- Teks hasil OCR diproses oleh AI extraction pipeline
- Gambar disimpan di storage untuk audit trail

**F1.4 Automatic Acknowledgement**

- Setiap pesan masuk mendapatkan respons cepat ("⏳ Sedang diproses...")
- Notifikasi sukses dikirim setelah transaksi tersimpan
- Notifikasi gagal dikirim jika terjadi error (beserta saran)

---

### F2 — AI Transaction Extraction

**F2.1 Transaction Data Extraction**

- Ekstrak: tipe (expense/income/transfer), nominal, mata uang, kategori, merchant, lokasi, metode pembayaran, tanggal
- Output berupa JSON terstruktur dengan confidence score
- Robust terhadap input tidak lengkap (partial extraction)

**F2.2 Auto-Categorization**

- Kategori default: Food, Transport, Shopping, Health, Entertainment, Bills, Education, Investment, Salary, Other
- Kategorisasi berdasarkan merchant name, konteks pesan, atau pola sebelumnya

**F2.3 Confidence Scoring**

- Setiap ekstraksi memiliki confidence score (0.0–1.0)
- Transaksi dengan confidence < 0.5 diberi flag untuk review manual
- Pengguna bisa koreksi via reply WhatsApp

---

### F3 — Reports & Insights

**F3.1 Daily Summary**

- Dikirim otomatis via WhatsApp setiap akhir hari (jika ada transaksi)
- Format: total pengeluaran hari ini, breakdown per kategori top 3

**F3.2 Weekly Report**

- Dikirim setiap hari Minggu malam
- Isi: total minggu ini, perbandingan dengan minggu lalu, kategori terbesar

**F3.3 Monthly Report**

- Dikirim setiap akhir bulan
- Isi: total bulanan, trend pengeluaran, kategori breakdown, unusual spending alert

**F3.4 On-Demand Query**

- Pengguna bisa tanya: "Berapa pengeluaran minggu ini?", "Rangkum bulan lalu"
- Sistem memproses natural language query dan mengirim ringkasan

---

### F4 — User Management

**F4.1 Auto-Registration**

- Pengguna otomatis terdaftar saat pertama kali mengirim pesan
- Identitas utama: nomor WhatsApp
- Tidak perlu signup/login terpisah

**F4.2 Session Management**

- WhatsApp session dikelola melalui WAHA
- Support multi-device per user di masa depan

---

### F5 — System Commands (via WhatsApp)

Pengguna bisa mengirim command sederhana:

| Command               | Fungsi                         |
| --------------------- | ------------------------------ |
| `/laporan hari ini`   | Ringkasan pengeluaran hari ini |
| `/laporan minggu ini` | Ringkasan minggu ini           |
| `/laporan bulan ini`  | Ringkasan bulan ini            |
| `/hapus terakhir`     | Hapus transaksi terakhir       |
| `/kategori`           | Lihat daftar kategori          |
| `/bantuan`            | Tampilkan panduan singkat      |

---

## 7. User Stories

### Epic 1: Input Transaksi

| ID    | User Story                                                                                           | Priority | Acceptance Criteria                                                    |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| US-01 | Sebagai pengguna, saya ingin mengirim teks "Makan siang 25rb gopay" dan transaksi tersimpan otomatis | High     | Transaksi tersimpan dengan amount=25000, payment=GoPay, dalam 10 detik |
| US-02 | Sebagai pengguna, saya ingin kirim voice note dan sistem memahami isinya                             | High     | Transcript akurat, transaksi tersimpan, konfirmasi terkirim            |
| US-03 | Sebagai pengguna, saya ingin foto struk dan data tersimpan tanpa ketik manual                        | High     | OCR berhasil, data terekstrak, konfirmasi terkirim                     |
| US-04 | Sebagai pengguna, saya ingin dapat konfirmasi bahwa transaksi berhasil dicatat                       | High     | Pesan konfirmasi berisi: nominal, kategori, merchant                   |
| US-05 | Sebagai pengguna, saya ingin koreksi transaksi yang salah lewat reply                                | Medium   | Reply "koreksi: 30rb" mengupdate transaksi terakhir                    |

### Epic 2: Laporan

| ID    | User Story                                                                | Priority | Acceptance Criteria                           |
| ----- | ------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| US-06 | Sebagai pengguna, saya ingin menerima ringkasan harian otomatis           | Medium   | Dikirim setiap hari jika ada ≥1 transaksi     |
| US-07 | Sebagai pengguna, saya ingin tahu berapa saya habiskan minggu ini         | High     | Query menghasilkan total + breakdown kategori |
| US-08 | Sebagai pengguna, saya ingin laporan bulanan dikirim otomatis             | Medium   | Dikirim akhir bulan, berisi trend & insight   |
| US-09 | Sebagai pengguna, saya ingin tahu kategori pengeluaran terbesar bulan ini | Medium   | Ditampilkan dalam laporan bulanan             |

---

## 8. Non-Functional Requirements

### NFR-01: Performance

- Webhook ACK response: < 500ms
- End-to-end processing (text → konfirmasi): < 10 detik
- End-to-end processing (voice/image → konfirmasi): < 30 detik
- System uptime: ≥ 99.5%

### NFR-02: Reliability

- Semua job dalam queue memiliki retry mechanism (3x dengan exponential backoff)
- Dead Letter Queue untuk job yang gagal permanen
- Raw message selalu disimpan sebelum diproses (data tidak hilang)

### NFR-03: Scalability

- Worker dapat di-scale horizontal secara independen
- Queue-based architecture memungkinkan load distribusi
- Database connection pooling

### NFR-04: Security

- Webhook HMAC validation (WAHA webhook secret)
- Semua environment variable dienkripsi
- API authentication menggunakan Bearer token
- Media files disimpan dengan akses terkontrol
- Tidak ada data sensitif di logs

### NFR-05: Observability

- Centralized structured logging (Pino)
- Queue monitoring via Bull Board
- Error alerting untuk job failures > threshold
- Request tracing dengan correlation ID

### NFR-06: Maintainability

- Kode mengikuti clean architecture
- AI provider dapat diganti tanpa perubahan business logic
- Database schema versioned dengan migrations
- Semua environment variable terdokumentasi di `.env.example`

---

## 9. Out of Scope (MVP)

Fitur berikut **tidak termasuk** dalam MVP v1.0:

- Budgeting dan limit pengeluaran per kategori
- Recurring transaction detection
- Anomaly detection
- Multi-currency selain IDR
- Integrasi bank langsung (open banking)
- Mobile app / web dashboard
- Telegram integration
- Multi-user / team finance
- Export ke Excel / PDF
- Email ingestion

---

## 10. Assumptions & Constraints

### Assumptions

- Pengguna memiliki akun WhatsApp aktif
- WAHA dapat di-deploy dan connect ke WhatsApp session
- Koneksi internet stabil untuk API calls ke AI providers
- Bahasa utama: Bahasa Indonesia (termasuk slang)

### Constraints

- WhatsApp tidak memiliki official API gratis; WAHA digunakan sebagai alternatif
- Rate limit Groq API (free tier: 7,200 req/hari untuk Whisper)
- Rate limit Gemini API (free tier: 15 RPM, 1,500 req/hari)
- Ketergantungan pada third-party AI APIs (Sumopod, Groq, Gemini)

---

## 11. Release Milestones

### Phase 1 — Foundation (Minggu 1–2)

- [ ] Monorepo setup & infrastructure
- [ ] Database schema & migrations
- [ ] WAHA webhook integration
- [ ] Raw message storage
- [ ] BullMQ queue setup

### Phase 2 — Core Pipeline (Minggu 3–4)

- [ ] Text extraction pipeline (Sumopod)
- [ ] Voice transcription pipeline (Groq Whisper)
- [ ] Image OCR pipeline (Gemini Vision)
- [ ] Transaction normalization & storage
- [ ] WhatsApp reply / konfirmasi

### Phase 3 — Reports & Commands (Minggu 5–6)

- [ ] Daily/weekly/monthly report generation
- [ ] On-demand query commands
- [ ] Report scheduling & delivery

### Phase 4 — Hardening (Minggu 7–8)

- [ ] Error handling & retry polish
- [ ] Observability (logging, Bull Board)
- [ ] Performance testing
- [ ] Security review
- [ ] Production deployment

---

_Dokumen ini adalah living document dan akan diperbarui seiring perkembangan produk._
