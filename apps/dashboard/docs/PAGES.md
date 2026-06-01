# FinCore Dashboard — Pages Guide

Dokumentasi setiap halaman beserta state, komponen, dan data flow.

---

## 1. Overview Dashboard

**Route:** [`/dashboard`](apps/dashboard/src/app/dashboard/page.tsx)
**Rendering:** Server Component

### Data Queried

- Summary (all-time + month-to-date + selected range)
- Monthly trend (6 bulan terakhir) — bar chart
- Category breakdown (top 6, filtered by range)
- Recent 8 transactions (with relations)
- Latest report from [`reports`](packages/db/src/schema/reports.ts) table

### Time Range Selector

URL query param `?range=` mengontrol range:
| Range | Key | Hari |
|---|---|---|
| 7 Hari | `7d` | 7 |
| 1 Bulan | `30d` | 30 (default) |
| 3 Bulan | `90d` | 90 |
| 6 Bulan | `180d` | 180 |
| 1 Tahun | `365d` | 365 |

### UI Components

- 4 `StatCard` — saldo, pemasukan MTD, pengeluaran MTD, total all-time
- Monthly trend chart — bar ganda (expense 🔴/income 🟢) + tabel ringkasan
- Category breakdown — progress bars horizontal
- Latest report card — period, total income/expense, net balance
- Recent transactions grid — 2 kolom, link ke edit

### States

| State         | Tampilan                                 |
| ------------- | ---------------------------------------- |
| Data kosong   | "Belum ada transaksi / data" center text |
| Normal        | Dashboard penuh                          |
| Report kosong | Report card tidak dirender               |

---

## 2. Transactions List

**Route:** [`/dashboard/transactions`](apps/dashboard/src/app/dashboard/transactions/page.tsx)
**Rendering:** Client Component

### Data

- [`GET /api/transactions`](apps/dashboard/docs/API.md#get-apitransactions) — paginated, filtered
- TanStack React Table untuk rendering + column definition
- Default: 20 items per page

### Filters

| Filter     | Control                                | Default |
| ---------- | -------------------------------------- | ------- |
| Search     | `Input` (debounced via Enter)          | —       |
| Type       | `Select` (all/income/expense/transfer) | All     |
| Pagination | Previous / Next buttons                | Page 1  |

### Table Columns

1. **Deskripsi** — nama transaksi + badge type + badge "Draft" (jika `isConfirmed=false`)
2. **Jumlah** — right-aligned, warna: emerald (income), red (expense), blue (transfer)
3. **Kategori** — icon + name, atau "—"
4. **Metode** — icon + name, atau "→" untuk transfer
5. **Tanggal** — DD/MM/YYYY

### Interactions

- Klik row → navigasi ke `/dashboard/transactions/:id/edit`
- Tombol "Tambah" → navigasi ke `/dashboard/transactions/new/edit`
- Filter Enter → reset ke page 1

### States

| State      | Tampilan                               |
| ---------- | -------------------------------------- |
| Loading    | 5 skeleton rows                        |
| Empty      | Icon + "Tidak ada transaksi ditemukan" |
| Data       | Table rows, clickable                  |
| Pagination | Hanya tampil jika `totalPages > 1`     |

---

## 3. Transaction Form (Create / Edit)

**Route:** [`/dashboard/transactions/:id/edit`](apps/dashboard/src/app/dashboard/transactions/[id]/edit/page.tsx)
**Route (new):** `/dashboard/transactions/new/edit` (aliased, ID = "new" berarti mode create)
**Rendering:** Client Component

### Mode Deteksi

- Jika `params.id !== "new"` → mode **edit**
- Jika `params.id === "new"` → mode **create**

### Data Loaded

| Data                    | Endpoint                    | Purpose                       |
| ----------------------- | --------------------------- | ----------------------------- |
| Categories              | `GET /api/categories`       | Category select options       |
| Payment Methods         | `GET /api/payment-methods`  | Payment method select options |
| Transaction (edit only) | `GET /api/transactions/:id` | Pre-fill form                 |

### Form Sections

1. **Informasi Transaksi**
   - Tipe — 3 tab toggle (Pengeluaran / Pemasukan / Transfer)
   - Nama — text input (required)
   - Jumlah — number input (required, > 0)
   - Biaya Admin — number input (default 0)
   - Tanggal — date input (default today)

2. **Kategori & Metode**
   - Kategori — select (all categories, filtered by type)
   - Metode Pembayaran — select (all payment methods)
   - Tujuan Transfer — select (hanya muncul jika type = "transfer")

3. **Detail Tambahan**
   - Merchant / Toko — text input
   - Lokasi — text input
   - Catatan — textarea

### Auto Calculations

- `totalAmount = amount + fee` (dihitung di server)

### Category Filtering

Category select otomatis terfilter berdasarkan tipe transaksi yang dipilih:

- **Expense** → hanya kategori bertipe `expense`
- **Income** → hanya kategori bertipe `income`
- **Transfer** → hanya kategori bertipe `transfer`

### Actions

| Action        | Method   | Endpoint                |
| ------------- | -------- | ----------------------- |
| Save (create) | `POST`   | `/api/transactions`     |
| Save (edit)   | `PATCH`  | `/api/transactions/:id` |
| Delete (edit) | `DELETE` | `/api/transactions/:id` |

### States

| State                | Tampilan                   |
| -------------------- | -------------------------- |
| Form kosong (create) | All fields default         |
| Form terisi (edit)   | Pre-filled dari API        |
| Saving               | Button disabled + spinner  |
| Success              | Toast + redirect ke list   |
| Error                | Toast error message        |
| Delete confirm       | `confirm()` dialog browser |

---

## 4. Categories

**Route:** [`/dashboard/categories`](apps/dashboard/src/app/dashboard/categories/page.tsx)
**Rendering:** Client Component

### Layout

Kategori dikelompokkan dalam 3 card berdasarkan tipe:

- 💸 **Pengeluaran** (expense)
- 💰 **Pemasukan** (income)
- 🔄 **Transfer** (transfer)

Setiap item menampilkan: icon emoji + nama + badge "Default" (jika `isDefault: true`)

### Create Dialog

- Nama Kategori — text input
- Tipe — select (expense / income / transfer)
- Ikon — emoji grid picker (23 options)

### States

| State      | Tampilan                |
| ---------- | ----------------------- |
| Loading    | 3 skeleton bars         |
| Empty type | Card dengan grid kosong |
| Data       | Grid 2-3 kolom item     |

---

## 5. Payment Methods

**Route:** [`/dashboard/payment-methods`](apps/dashboard/src/app/dashboard/payment-methods/page.tsx)
**Rendering:** Client Component

### Layout

Dikelompokkan berdasarkan tipe:

- Cash, E-Wallet, Bank, Kartu Kredit, Kartu Debit, QRIS, Lainnya

### Create Dialog

- Nama — text input
- Tipe — select (7 enum options)
- Ikon — emoji grid picker (11 options)

### States

| State       | Tampilan            |
| ----------- | ------------------- |
| Loading     | Skeleton bars       |
| Empty group | Card tidak dirender |
| Data        | Grid items          |

---

## 6. Tags

**Route:** [`/dashboard/tags`](apps/dashboard/src/app/dashboard/tags/page.tsx)
**Rendering:** Client Component

### Inline Create Form

- Nama Tag — text input
- Warna — 10 color circle buttons (predefined palette)
- Submit button

### Display

Tags dirender sebagai `Badge` components dengan:

- Color dot (bulatan warna)
- Nama tag
- Outline variant

### States

| State   | Tampilan                                        |
| ------- | ----------------------------------------------- |
| Loading | Skeleton bars                                   |
| Empty   | "Belum ada tag. Buat tag pertama Anda di atas." |
| Data    | Badge grid (wrap)                               |

---

## 7. Budgets

**Route:** [`/dashboard/budgets`](apps/dashboard/src/app/dashboard/budgets/page.tsx)
**Rendering:** Client Component

### Data

- [`GET /api/budgets?month=X&year=Y`](apps/dashboard/docs/API.md#get-apibudgets) — termasuk perhitungan actual spending

### Month/Year Selector

Dua select dropdown untuk navigasi bulan + tahun:

- Bulan: Januari–Desember
- Tahun: 2024–2027

### Budget Cards

Setiap budget menampilkan:

- Nama kategori (dengan icon)
- Status badge: 🔴 "Over Budget" / 🟡 "Hampir Penuh" / 🟢 (none)
- Progress bar: emerald (safe) → yellow (warning) → destructive (over)
- Teks: "X% terpakai"
- Angka: `spent / amount` dalam format IDR

### Create Dialog

- Kategori — select (hanya expense categories)
- Jumlah Budget — number input (Rp)
- Month/year mengikuti selector di luar dialog

### States

| State   | Tampilan                          |
| ------- | --------------------------------- |
| Loading | Skeleton bars                     |
| Empty   | Empty state dengan PiggyBank icon |
| Data    | Progress bar cards                |

---

## 8. Recurring Bills

**Route:** [`/dashboard/recurring-bills`](apps/dashboard/src/app/dashboard/recurring-bills/page.tsx)
**Rendering:** Client Component

### Data

- [`GET /api/recurring-bills`](apps/dashboard/docs/API.md#get-apirecurring-bills)
- Diurutkan berdasarkan `nextReminderAt` ascending

### Bill Cards

Setiap tagihan menampilkan:

- Nama + frequency badge (Harian/Mingguan/Bulanan/Tahunan)
- 🔴 "Terlambat" badge jika `nextReminderAt < today`
- Jumlah (jika ada)
- Kategori + metode pembayaran
- Tanggal pengingat berikutnya (dengan CalendarClock icon)
- Jatuh tempo tanggal (jika `dayOfMonth` di-set)

### Create Dialog

- Nama Tagihan — text input
- Jumlah — number input (optional)
- Frekuensi — select (Bulanan/Mingguan/Tahunan/Harian)
- Tanggal — number input (1-31)
- Pengingat Berikutnya — date input

### States

| State   | Tampilan                       |
| ------- | ------------------------------ |
| Loading | Skeleton bars                  |
| Empty   | Empty state dengan Repeat icon |
| Data    | Bill cards                     |
| Overdue | Border + icon merah            |

---

## 9. System Logs

**Route:** [`/dashboard/system`](apps/dashboard/src/app/dashboard/system/page.tsx)
**Rendering:** Client Component

### Data

- [`GET /api/logs`](apps/dashboard/src/app/api/logs/route.ts) — paginated (15/page), filterable by search + status
- Real-time stats computed from returned data

### Features

#### Stats Cards

4 stat cards + status distribution bar chart:

- **Success Rate** — percentage with colored progress bar
- **Failed** — count dari total
- **Active / Pending** — processing + pending count
- **Avg Latency** — rata-rata durasi per step (ms atau s)

#### Table Columns

| Kolom           | Konten                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Waktu           | Tanggal + jam (format `DD MMM YYYY` / `HH:mm:ss`)                                                   |
| Pengirim        | Nomor WA terpotong (max 120px)                                                                      |
| Pesan / Payload | Type icon + badge + **media thumbnail** (image) atau placeholder (voice/video/document) + body text |
| Status          | Colored badge (Pending/Processing/Done/Failed/Skipped)                                              |
| Detail          | JSON button → membuka dialog detail                                                                 |

#### Media Thumbnails

- **Image:** 40×40px thumbnail di-load dari [`/api/media?p=`](apps/dashboard/docs/API.md#get-apimediapbase64url-encoded-storagepath) (session-gated, obfuscated URL)
- **Video/Voice/Document:** Gradient placeholder dengan icon

#### Detail Dialog (Tabbed)

Menggunakan [`Tabs`](apps/dashboard/src/components/ui/tabs.tsx) component dengan 3-4 tab:

| Tab             | Konten                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Steps**       | **Processing timeline** — vertical timeline dengan dot berwarna (hijau=done, merah=failed, biru=active). Setiap step menampilkan nama, status badge, durasi, provider, dan error (jika ada) |
| **Raw Message** | JSON `rawPayload` dengan **copy-to-clipboard button** (ikon clipboard, konfirmasi 2 detik)                                                                                                  |
| **AI Output**   | (Jika tersedia) JSON output AI dengan provider, model, prompt/response preview, parsed output, latency, token usage. Masing-masing dengan copy button                                       |
| **Media**       | (Jika media) **Preview inline** — `<img>` untuk image, `<video>` untuk video, `<audio>` untuk voice, link untuk PDF. Metadata: type, MIME, original URL, storage path                       |

#### Copy-to-Clipboard

Setiap JSON block memiliki tombol copy (ikon `Copy`) di pojok kanan atas. Saat diklik:

1. JSON string di-copy via `navigator.clipboard.writeText()`
2. Ikon berubah ke `ClipboardCopy` (hijau) selama 2 detik
3. Kembali ke ikon `Copy` (default)

### Security: Media URL Obfuscation

Media tidak pernah di-ekspos dengan path filesystem langsung. URL ke file media menggunakan skema:

```
┌──────────────────────┐      ┌─────────────────────┐
│ storagePath (DB)     │      │ Obfuscated URL      │
│ local://uploads/     │ ──►  │ /api/media?p=       │
│   image/uuid.jpg     │      │   <base64url>        │
└──────────────────────┘      └─────────────────────┘
```

- [`lib/media-url.ts`](apps/dashboard/src/lib/media-url.ts) — `buildMediaUrl()` / `decodeMediaPath()` / `isPreviewableType()` / `getMediaPlaceholderClass()`
- [`api/media/route.ts`](apps/dashboard/src/app/api/media/route.ts) — session-gated media serving endpoint

### Filters

| Filter | Control                                               | Default |
| ------ | ----------------------------------------------------- | ------- |
| Search | `Input` (Enter to submit)                             | —       |
| Status | `Select` (all/pending/processing/done/failed/skipped) | All     |

### Pagination

Previous / Next buttons, muncul jika `totalPages > 1`.

### States

| State               | Tampilan                                    |
| ------------------- | ------------------------------------------- |
| Loading             | 8 skeleton rows                             |
| Empty (no search)   | "Log pemrosesan akan muncul di sini"        |
| Empty (with search) | "Coba ubah filter pencarian"                |
| Data                | Table rows dengan thumbnail + detail dialog |
| Error               | `console.error` (silent, data tetap kosong) |

---

## 10. Settings

**Route:** [`/dashboard/settings`](apps/dashboard/src/app/dashboard/settings/page.tsx)
**Rendering:** Client Component (interactive inline editing)

### API Endpoints Used

| Endpoint                                                         | Method   | Purpose                     |
| ---------------------------------------------------------------- | -------- | --------------------------- |
| [`/api/settings`](apps/dashboard/docs/API.md#get-apisettings)    | `GET`    | Load profile & preferences  |
| [`/api/settings`](apps/dashboard/docs/API.md#patch-apisettings)  | `PATCH`  | Save individual field edits |
| [`/api/sessions`](apps/dashboard/docs/API.md#get-apisessions)    | `GET`    | List active sessions        |
| [`/api/sessions`](apps/dashboard/docs/API.md#delete-apisessions) | `DELETE` | Sign out a specific session |

### Sections

#### 1. Profil (editable)

| Field      | Type                                              | Read-only?                           |
| ---------- | ------------------------------------------------- | ------------------------------------ |
| Nama       | Text input (inline)                               | No — edit via pencil icon            |
| Nomor WA   | Text display                                      | **Yes** — managed by WA registration |
| Zona Waktu | Select dropdown (WIB/WITA/WIT/UTC)                | No                                   |
| Mata Uang  | Select dropdown (IDR/USD/SGD/MYR/EUR/GBP/JPY/AUD) | No                                   |

#### 2. Preferensi Laporan (editable)

| Field          | Type                                         |
| -------------- | -------------------------------------------- |
| Jadwal Laporan | Select — Harian/Mingguan/Bulanan/Tidak Aktif |
| Waktu Kirim    | Time input (HTML `type="time"`)              |

#### 3. Sesi Aktif

- List semua sesi aktif milik user dengan icon smartphone + badge "Aktif" untuk sesi saat ini
- Setiap sesi menampilkan: label (`Sesi xxxxxxxx`), waktu login relatif, tanggal kadaluarsa
- Tombol **Keluarkan** — sign out sesi tertentu (kecuali sesi saat ini)
- Tombol **"Keluar dari Semua Sesi"** — redirect ke `/api/auth/logout`

#### 4. Aktivitas Akun (read-only)

- Tanggal Bergabung + Status badge

### Inline Editing Pattern

Setiap field yang dapat diedit menggunakan komponen `EditableField`:

```
[Icon] Label          Value [pencil icon]
                              ↓ click
[Icon] Label          [input/select] [✓] [✕]
                              ↓ save
[Icon] Label          New Value  + toast "Pengaturan disimpan"
```

- Pencil icon muncul saat hover (opacity transition)
- Save via `PATCH /api/settings` dengan hanya field yang diubah
- Loading spinner di tombol save saat request berjalan

### States

| State            | Tampilan                            |
| ---------------- | ----------------------------------- |
| Loading          | Skeleton cards (3 blocks)           |
| Loaded           | All cards with inline edit controls |
| Saving           | Spinner on save button              |
| Save error       | Toast error                         |
| Session sign-out | Sesi hilang + toast                 |

---

## Sidebar Navigation

**Component:** [`layout.tsx`](apps/dashboard/src/app/dashboard/layout.tsx) (Client Component)

### Features

- **Desktop:** Collapsible sidebar (16px collapsed / 240px expanded)
- **Mobile:** Hamburger menu → full-height drawer overlay
- **Tooltips:** Muncul saat sidebar collapsed (hover)
- **Active state:** Background primary/10 + text primary
- **Bottom section:** Settings link + Collapse toggle button
- **Logout:** Link ke `/api/auth/logout`

### Nav Items

| Icon            | Label           | Route                        |
| --------------- | --------------- | ---------------------------- |
| LayoutDashboard | Overview        | `/dashboard`                 |
| CreditCard      | Transaksi       | `/dashboard/transactions`    |
| Tags            | Kategori        | `/dashboard/categories`      |
| Wallet          | Metode Bayar    | `/dashboard/payment-methods` |
| PiggyBank       | Budget          | `/dashboard/budgets`         |
| Repeat          | Tagihan Berkala | `/dashboard/recurring-bills` |
| Settings        | Pengaturan      | `/dashboard/settings`        |

---

## UI Conventions

### Colors

| Meaning            | CSS                                 |
| ------------------ | ----------------------------------- |
| Pemasukan / Profit | `text-emerald-500`                  |
| Pengeluaran / Loss | `text-red-500`                      |
| Transfer / Neutral | `text-blue-500`                     |
| Primary actions    | `bg-primary`                        |
| Muted text         | `text-muted-foreground`             |
| Draft / Warning    | `border-yellow-500 text-yellow-500` |
| Over budget        | `bg-destructive`                    |

### Typography

- Page titles: `text-2xl font-bold tracking-tight`
- Card titles: `text-base font-medium`
- Body: `text-sm`
- Captions: `text-xs text-muted-foreground`
- Monetary values: `font-medium tabular-nums` (monospaced numbers)

### Interactions

- All transactions table rows are clickable (navigate to edit)
- Form submits show loading spinner on button
- Success/error feedback via `toast()` (Sonner)
- Delete requires browser `confirm()` dialog
- Dialog closes on successful create
