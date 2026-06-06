# Tech Stack FinCore

Dokumen ini berisi daftar lengkap teknologi, framework, pustaka (libraries), dan perkakas (tools) yang digunakan di seluruh monorepo **FinCore**.

---

## 📊 Ringkasan Monorepo

- **Workspace Manager**: PNPM Workspaces (v11.3.0)
- **Build System & Orchestrator**: Turborepo (v2.0.0)
- **Runtime**: Node.js (>=20.0.0)
- **Bahasa**: TypeScript (v5.3.3)

---

## 🛠️ Arsitektur Sistem & Aplikasi (Workspaces)

### 1. Applications (`apps/`)

#### 🔹 `@fincore/api` (REST API Server)

Aplikasi backend utama yang melayani request client menggunakan framework NestJS dan Fastify.

- **Core Framework**: `@nestjs/common` (v10.3.0), `@nestjs/core` (v10.3.0)
- **HTTP Engine**: Fastify via `@nestjs/platform-fastify` (v10.3.0)
- **Dokumentasi API**: OpenAPI / Swagger via `@nestjs/swagger` (v7.3.0)
- **Database Client**: `drizzle-orm` (v0.45.2)
- **Validasi Skema**: `zod` (v3.22.4)
- **Reactive Extensions**: `rxjs` (v7.8.1)
- **Metadata**: `reflect-metadata` (v0.2.1)

#### 🔹 `@fincore/worker` (Background Job Processor)

Aplikasi worker yang menangani proses komputasi berat, OCR, ekstraksi AI, transkripsi suara, dan penjadwalan.

- **Core Framework**: `@nestjs/common` (v10.3.0), `@nestjs/core` (v10.3.0)
- **Job Queue Engine**: `bullmq` (v5.77.3)
- **HTTP Client**: `axios` (v1.16.1)
- **Date Utility**: `dayjs` (v1.11.21)
- **Database Client**: `drizzle-orm` (v0.45.2)
- **Image Processing (OCR Input)**: `sharp` (v0.34.5)

#### 🔹 `@fincore/sender` (WhatsApp Integration Service)

Aplikasi khusus yang bertindak sebagai gateway pengiriman notifikasi/laporan keuangan ke WhatsApp.

- **Core Framework**: `@nestjs/common` (v10.3.0), `@nestjs/core` (v10.3.0)
- **HTTP Client**: `axios` (v1.16.1), `@nestjs/axios` (v3.0.2)
- **Queue Receiver**: `bullmq` (v5.77.3)

---

### 2. Internal Packages (`packages/`)

Pustaka bersama (shared libraries) yang digunakan oleh aplikasi-aplikasi di atas.

| Package                  | Deskripsi                              | Utama Pustaka/Ketergantungan                                                  |
| :----------------------- | :------------------------------------- | :---------------------------------------------------------------------------- |
| **`@fincore/ai`**        | Modul integrasi ke AI Providers        | `@google/generative-ai` (v0.11.0), `groq-sdk` (v0.5.0), `axios`, `form-data`  |
| **`@fincore/db`**        | Schema database dan database connector | `drizzle-orm` (v0.45.2), `pg` (v8.11.3), `drizzle-kit` (v0.30.5), `tsx` (dev) |
| **`@fincore/logger`**    | Logger terpusat dengan performa tinggi | `pino` (v9.1.0), `pino-pretty` (v11.0.0)                                      |
| **`@fincore/queue`**     | Modul pembungkus antrean BullMQ        | `bullmq` (v5.77.3), `ioredis` (v5.10.1)                                       |
| **`@fincore/config`**    | Validasi dan pembacaan env terpusat    | `dotenv` (v17.4.2), `zod` (v3.22.4)                                           |
| **`@fincore/contracts`** | Skema kontrak data                     | `zod` (v3.22.4)                                                               |
| **`@fincore/utils`**     | Fungsi pembantu umum (helpers)         | `dayjs` (v1.11.10)                                                            |
| **`@fincore/storage`**   | Layanan penyimpanan berkas             | Tergantung pada modul logger dan config                                       |
| **`@fincore/shared`**    | Konstanta dan tipe data bersama        | TypeScript native                                                             |
| **`@fincore/analytics`** | Modul kalkulasi analitik keuangan      | TypeScript native                                                             |

---

## 🔧 Perkakas Pengembangan & Git Safety (`devDependencies`)

Daftar alat bantu pengembangan yang dipasang di tingkat root proyek untuk menjaga kualitas kode dan alur kerja Git:

- **Format Kode**: `prettier` (v3.2.0) - Memastikan gaya penulisan kode seragam.
- **Linter**: `eslint` - Mengecek kepatuhan kode dan best practices.
- **Testing**: `jest` - Kerangka pengujian unit (unit testing) pada sub-aplikasi.
- **Kualitas Git Commit/Push**:
  - `husky` (v9.1.7) - Menjalankan hook git pra-komit dan pra-push otomatis.
  - `lint-staged` (v15.3.0) - Hanya memformat file yang masuk ke staging area git.

---

## 📈 Statistik Pustaka (Libraries)

- **Total Pustaka Eksternal Utama**: ~18 pustaka (seperti NestJS core, Fastify, Drizzle, BullMQ, Pino, Zod, Axios, Sharp, Dayjs, Valkey/Redis driver, Postgres driver, AI SDKs).
- **Total Workspace Paket Internal**: 10 paket internal.
- **Total Aplikasi**: 3 NestJS aplikasi.
