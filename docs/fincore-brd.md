# Business Requirements Document (BRD)

## FinCore — AI-Native Finance Assistant via WhatsApp

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2025
**Author:** FinCore Business Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Opportunity](#2-business-context--opportunity)
3. [Business Objectives](#3-business-objectives)
4. [Stakeholders](#4-stakeholders)
5. [Current State (As-Is)](#5-current-state-as-is)
6. [Future State (To-Be)](#6-future-state-to-be)
7. [Business Requirements](#7-business-requirements)
8. [Business Rules](#8-business-rules)
9. [Operational Requirements](#9-operational-requirements)
10. [Risk Analysis](#10-risk-analysis)
11. [Cost–Benefit Analysis](#11-costbenefit-analysis)
12. [Compliance & Regulatory](#12-compliance--regulatory)
13. [Success Criteria & KPIs](#13-success-criteria--kpis)

---

## 1. Executive Summary

FinCore adalah inisiatif produk untuk membangun platform manajemen keuangan personal berbasis WhatsApp yang memanfaatkan kecerdasan buatan. Dokumen ini mendefinisikan kebutuhan bisnis, tujuan strategis, dan parameter keberhasilan yang harus dipenuhi oleh platform ini.

**Problem Statement:** Mayoritas masyarakat Indonesia — khususnya kelas menengah urban — tidak konsisten mencatat keuangan karena solusi yang ada terlalu kompleks, memerlukan disiplin ekstra, dan tidak terintegrasi dengan platform komunikasi yang mereka gunakan setiap hari.

**Proposed Solution:** Platform yang memungkinkan pencatatan keuangan secara natural melalui WhatsApp, memanfaatkan AI untuk memproses berbagai format input menjadi data keuangan terstruktur.

---

## 2. Business Context & Opportunity

### Market Context

Indonesia memiliki lebih dari **270 juta penduduk** dengan penetrasi smartphone yang terus meningkat. Beberapa fakta relevan:

| Fakta                                           | Data             |
| ----------------------------------------------- | ---------------- |
| Pengguna WhatsApp di Indonesia                  | ~100 juta (2024) |
| Pengguna e-wallet aktif (GoPay, OVO, Dana)      | ~180 juta akun   |
| Masyarakat yang punya anggaran pribadi tertulis | < 20%            |
| Pengguna aplikasi finance tracking              | ~15 juta         |

### Problem Size

Gap antara pengguna e-wallet (~180 juta) dan pengguna aplikasi finance tracker (~15 juta) menunjukkan bahwa **>90% pengguna digital payment tidak mencatat keuangan secara sistematis** — bukan karena tidak mau, tetapi karena solusinya tidak cukup mudah dan tidak di platform yang tepat.

### Opportunity

WhatsApp adalah platform yang sudah dipakai oleh hampir semua target pengguna. Dengan memindahkan pencatatan keuangan ke WhatsApp, barrier to entry turun drastis. FinCore mengisi celah ini dengan menggabungkan:

- **Familiar platform** (WhatsApp)
- **AI-powered processing** (tidak perlu format khusus)
- **Multimodal input** (text, suara, gambar)

---

## 3. Business Objectives

### Primary Objectives

| ID    | Objective                                | Target                          | Timeline |
| ----- | ---------------------------------------- | ------------------------------- | -------- |
| BO-01 | Luncurkan MVP yang fungsional dan stabil | 100 beta users                  | Q3 2025  |
| BO-02 | Validasi product-market fit              | Retention rate bulan ke-2 ≥ 50% | Q4 2025  |
| BO-03 | Capai 1.000 pengguna aktif               | DAU ≥ 1.000                     | Q1 2026  |
| BO-04 | Monetisasi via subscription model        | 100 paying users                | Q2 2026  |

### Strategic Objectives

- Membangun **data moat** dari transaksi keuangan pengguna Indonesia
- Menciptakan **platform extensible** yang bisa diperluas ke budgeting, investment advice, dan UMKM finance
- Memposisikan FinCore sebagai **kategori baru**: conversational personal finance

---

## 4. Stakeholders

### Internal Stakeholders

| Stakeholder       | Role                  | Kepentingan                    | Level Pengaruh |
| ----------------- | --------------------- | ------------------------------ | -------------- |
| Product Owner     | Pemilik visi produk   | Fitur sesuai kebutuhan user    | Tinggi         |
| Engineering Lead  | Arsitektur & delivery | Sistem scalable & maintainable | Tinggi         |
| Backend Developer | Implementasi          | Kode bersih, spec jelas        | Medium         |
| DevOps / Infra    | Deployment & infra    | Stabilitas & observability     | Medium         |

### External Stakeholders

| Stakeholder                          | Role             | Kepentingan                       |
| ------------------------------------ | ---------------- | --------------------------------- |
| End Users                            | Pengguna akhir   | Kemudahan, akurasi, privasi       |
| AI Providers (Sumopod, Groq, Gemini) | Layanan AI       | Penggunaan sesuai ToS, pembayaran |
| WAHA                                 | WhatsApp gateway | Stabilitas penggunaan             |
| Cloud Provider                       | Infrastruktur    | Pembayaran                        |

---

## 5. Current State (As-Is)

### Bagaimana pengguna mencatat keuangan saat ini

```
┌─────────────────────────────────────────────────────────┐
│                    CURRENT STATE                        │
│                                                         │
│  Transaksi terjadi → User LUPA / MALAS catat           │
│                                                         │
│  Jika mencatat:                                         │
│  ├── Buka aplikasi terpisah (buka, login, navigasi)     │
│  ├── Isi form: kategori, nominal, tanggal, deskripsi    │
│  ├── Save                                               │
│  └── Keluar                                             │
│                                                         │
│  Effort per transaksi: ~2–3 menit                       │
│  Konsistensi rata-rata: 2–3 minggu lalu berhenti        │
│                                                         │
│  Pain Points:                                           │
│  - Terlalu banyak step                                  │
│  - Harus ingat format yang tepat                        │
│  - Tidak ada yang proses struk/screenshot               │
│  - Laporan tidak relevan / tidak dipahami               │
└─────────────────────────────────────────────────────────┘
```

### Solusi Eksisting & Kekurangannya

| Produk                 | Kekurangan untuk Target User Indonesia            |
| ---------------------- | ------------------------------------------------- |
| Money Manager          | UI kompleks, tidak support WhatsApp, input manual |
| Wallet by BudgetBakers | Tidak support bahasa Indonesia informal           |
| Sribuu                 | Fitur bagus tapi butuh install app baru           |
| Notion / Spreadsheet   | Terlalu teknis, tidak ada AI                      |
| Catatan manual         | Tidak terstruktur, tidak ada insights             |

---

## 6. Future State (To-Be)

```
┌─────────────────────────────────────────────────────────┐
│                    FUTURE STATE (FinCore)               │
│                                                         │
│  Transaksi terjadi                                      │
│       ↓                                                 │
│  User kirim pesan WhatsApp (text / voice / foto)        │
│       ↓                                                 │
│  FinCore proses otomatis (< 10 detik)                   │
│       ↓                                                 │
│  Konfirmasi masuk ke WhatsApp                           │
│       ↓                                                 │
│  Laporan otomatis dikirim (harian/mingguan/bulanan)     │
│                                                         │
│  Effort per transaksi: ~5 detik                         │
│  Konsistensi: natural karena via WhatsApp               │
│                                                         │
│  Value Delivered:                                       │
│  ✅ Tidak perlu install app baru                        │
│  ✅ Pahami Bahasa Indonesia informal                    │
│  ✅ Proses struk & voice otomatis                       │
│  ✅ Laporan dikirim ke WhatsApp                         │
│  ✅ Data aman & tersimpan                               │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Business Requirements

### BR-01: Kemudahan Input

**Pernyataan:** Sistem harus mampu menerima dan memproses setidaknya 3 format input (teks, suara, gambar) dari WhatsApp tanpa mengharuskan pengguna mengikuti format tertentu.

**Rationale:** Kesederhanaan input adalah faktor utama adopsi. Jika pengguna harus mengikuti template kaku, tingkat penggunaan akan turun drastis.

**Kriteria Penerimaan:**

- Teks informal "kebab 12k gopay" berhasil diproses
- Voice note 10–60 detik berhasil ditranscribe dan diproses
- Foto struk JPG/PNG berhasil di-OCR dan diproses

---

### BR-02: Akurasi AI Extraction

**Pernyataan:** AI extraction harus menghasilkan data transaksi yang akurat untuk minimal 80% input pada saat peluncuran, dengan target 90% dalam 6 bulan.

**Rationale:** Akurasi yang rendah akan menyebabkan pengguna tidak percaya sistem dan berhenti menggunakan.

**Kriteria Penerimaan:**

- Nominal transaksi terekstrak dengan benar ≥ 80%
- Kategori terpilih relevan ≥ 75%
- Metode pembayaran teridentifikasi ≥ 85%

---

### BR-03: Kecepatan Respon

**Pernyataan:** Pengguna harus menerima konfirmasi dari FinCore dalam waktu maksimal 10 detik untuk teks, dan 30 detik untuk voice/gambar.

**Rationale:** Feedback yang lambat menurunkan kepercayaan dan engagement. Pengguna perlu tahu bahwa pesannya "didengar" dengan cepat.

**Kriteria Penerimaan:**

- Ack message ("⏳ Memproses...") terkirim < 2 detik
- Konfirmasi sukses untuk teks terkirim < 10 detik
- Konfirmasi sukses untuk voice/image terkirim < 30 detik

---

### BR-04: Keandalan Sistem

**Pernyataan:** Sistem harus memiliki uptime minimal 99% dan tidak ada data transaksi yang hilang akibat kegagalan sistem.

**Rationale:** Kehilangan data keuangan pengguna dapat merusak kepercayaan secara permanen.

**Kriteria Penerimaan:**

- Raw message selalu disimpan sebelum diproses
- Queue retry mechanism berjalan otomatis pada kegagalan
- Uptime ≥ 99% dalam 30 hari pertama production

---

### BR-05: Laporan yang Berguna

**Pernyataan:** Sistem harus mengirimkan laporan keuangan yang relevan, mudah dipahami, dan actionable ke WhatsApp pengguna secara otomatis.

**Rationale:** Laporan adalah nilai utama yang membedakan FinCore dari sekadar mencatat — ini yang membuat pengguna terus menggunakannya.

**Kriteria Penerimaan:**

- Laporan harian terkirim jika ada ≥ 1 transaksi
- Laporan mingguan terkirim setiap Minggu
- Laporan dapat diminta on-demand via command

---

### BR-06: Privasi & Keamanan Data

**Pernyataan:** Data keuangan pengguna harus disimpan secara aman, tidak dibagikan ke pihak ketiga, dan dapat dihapus atas permintaan.

**Rationale:** Data keuangan sangat sensitif. Kepercayaan pengguna bergantung pada komitmen privasi yang jelas.

**Kriteria Penerimaan:**

- Data terenkripsi at-rest
- Environment variables tidak terekspos di logs
- Tidak ada data pengguna dikirim ke provider AI selain konten pesan yang perlu diproses
- Pengguna bisa request hapus data

---

## 8. Business Rules

| ID     | Rule                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| BR-R01 | Setiap nomor WhatsApp unik dianggap sebagai satu user; tidak perlu email/password             |
| BR-R02 | Transaksi dengan confidence score < 0.5 diberi flag dan tidak ditampilkan sebagai "confirmed" |
| BR-R03 | Mata uang default adalah IDR; transaksi dalam mata uang lain disimpan as-is dengan flag       |
| BR-R04 | Laporan harian hanya dikirim jika ada minimal 1 transaksi pada hari tersebut                  |
| BR-R05 | User dapat membatalkan transaksi terakhir dalam 24 jam dengan command `/hapus terakhir`       |
| BR-R06 | Semua raw message disimpan selamanya untuk keperluan audit dan reprocessing                   |
| BR-R07 | AI provider dapat diganti tanpa perubahan pada data atau business logic                       |
| BR-R08 | Waktu transaksi default ke waktu pesan diterima jika tidak disebutkan eksplisit               |

---

## 9. Operational Requirements

### OR-01: Deployment

- Sistem di-deploy di cloud (VPS/container) dengan Docker Compose
- Minimal: 2 vCPU, 4GB RAM untuk production
- Database backup otomatis harian

### OR-02: Monitoring

- Logging terpusat (Pino) untuk semua layanan
- Bull Board dapat diakses untuk monitoring queue
- Alert via Telegram/email jika job failure rate > 5%

### OR-03: Support & Maintenance

- Bug critical: response dalam 4 jam, fix dalam 24 jam
- Bug non-critical: fix dalam sprint berikutnya
- AI provider downtime: fallback ke provider sekunder

### OR-04: Data Retention

- Raw messages: simpan permanen (untuk audit & reprocessing)
- AI outputs: simpan permanen
- Laporan: simpan 12 bulan

---

## 10. Risk Analysis

| ID   | Risiko                                     | Kemungkinan | Dampak   | Mitigasi                                                      |
| ---- | ------------------------------------------ | ----------- | -------- | ------------------------------------------------------------- |
| R-01 | WhatsApp ban akun WAHA                     | Medium      | High     | Gunakan nomor dedicated, ikuti ToS, siapkan backup session    |
| R-02 | AI provider downtime (Sumopod/Groq/Gemini) | Low         | High     | Fallback provider, retry queue, graceful degradation          |
| R-03 | AI extraction accuracy rendah              | Medium      | High     | Continuous evaluation, prompt tuning, human feedback loop     |
| R-04 | Biaya AI API melonjak                      | Low         | Medium   | Monitor usage, implement rate limiting, consider self-hosted  |
| R-05 | Data breach                                | Very Low    | Critical | Enkripsi, minimal data ke AI, audit regular                   |
| R-06 | User tidak adopt                           | Medium      | High     | Beta testing ketat, onboarding yang baik, feedback loop cepat |
| R-07 | Skalabilitas sistem tidak cukup            | Low         | Medium   | Queue-based architecture memungkinkan horizontal scaling      |

---

## 11. Cost–Benefit Analysis

### Estimasi Biaya Operasional (per bulan, 1.000 users aktif)

| Komponen                | Estimasi Biaya                  |
| ----------------------- | ------------------------------- |
| VPS/Cloud (2 vCPU, 4GB) | Rp 300.000 – 500.000            |
| PostgreSQL + Redis      | Rp 0 (self-hosted)              |
| Sumopod API             | ~$10–30 (tergantung volume)     |
| Groq Whisper API        | Rp 0 (free tier mencukupi)      |
| Gemini Vision API       | Rp 0 (free tier mencukupi)      |
| **Total Estimasi**      | **~Rp 450.000 – 900.000/bulan** |

### Estimasi Revenue (Model Freemium)

| Tier              | Harga           | Target Users | Revenue                 |
| ----------------- | --------------- | ------------ | ----------------------- |
| Free              | Rp 0            | 800 users    | Rp 0                    |
| Pro (50 tx/bulan) | Rp 29.000/bulan | 150 users    | Rp 4.350.000            |
| Unlimited         | Rp 49.000/bulan | 50 users     | Rp 2.450.000            |
| **Total**         |                 |              | **~Rp 6.800.000/bulan** |

_Proyeksi Break-even: bulan ke-3 setelah monetisasi_

---

## 12. Compliance & Regulatory

### Data Privacy

- Mengikuti **UU PDP (Perlindungan Data Pribadi) Indonesia** yang berlaku sejak 2024
- Data keuangan termasuk data sensitif per UU PDP
- Wajib tersedia: privacy policy, mekanisme consent, hak hapus data

### WhatsApp ToS

- Penggunaan WAHA harus mengikuti WhatsApp Business Terms of Service
- Tidak boleh digunakan untuk spam atau bulk messaging
- Gunakan nomor yang didedikasikan khusus untuk FinCore

### Financial Services

- FinCore **bukan** platform jasa keuangan; hanya alat pencatatan pribadi
- Tidak memerlukan lisensi OJK selama tidak mengelola dana pengguna

---

## 13. Success Criteria & KPIs

### Business KPIs

| KPI                             | Baseline | Target 3 Bulan | Target 6 Bulan |
| ------------------------------- | -------- | -------------- | -------------- |
| Total Registered Users          | 0        | 200            | 1.000          |
| Daily Active Users              | 0        | 50             | 300            |
| Transaksi tercatat per bulan    | 0        | 2.000          | 15.000         |
| AI extraction accuracy          | -        | 80%            | 90%            |
| User retention bulan ke-2       | -        | 50%            | 65%            |
| Paying users                    | 0        | 0              | 100            |
| MRR (Monthly Recurring Revenue) | Rp 0     | Rp 0           | Rp 5.000.000   |

### Technical KPIs

| KPI                          | Target     |
| ---------------------------- | ---------- |
| System uptime                | ≥ 99%      |
| End-to-end latency (text)    | < 10 detik |
| Queue job failure rate       | < 5%       |
| Worker processing time (p95) | < 15 detik |

### Definition of Success (MVP)

MVP dianggap berhasil jika dalam 60 hari setelah launch:

1. ≥ 50 pengguna aktif mencatat minimal 1x per minggu
2. AI extraction accuracy ≥ 80%
3. Zero critical data loss incidents
4. Net Promoter Score (NPS) ≥ 30

---

_Dokumen ini merupakan living document dan akan diperbarui seiring perkembangan bisnis._
