# FinCore Dashboard — API Reference

Semua API route di-serve dari `/api/**` oleh Next.js Route Handlers. Autentikasi dilakukan melalui HTTP-Only cookie `fincore_session` yang divalidasi oleh [`getCurrentUser()`](apps/dashboard/src/lib/auth.ts).

---

## Base URL

```
http://localhost:3001/api
```

## Authentication

Semua endpoint (kecuali `/api/auth/**`) memanggil `getCurrentUser()` yang:

1. Membaca `fincore_session` cookie
2. Query `user_sessions` JOIN `users` berdasarkan session ID
3. Validasi `expiresAt` belum lewat
4. Auto-redirect ke `/login` jika tidak valid (HTTP 307)

---

## 1. Auth

### `GET /api/auth/verify?token={magicToken}`

Validasi magic token dari WhatsApp, set session cookie, redirect ke `/dashboard`.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `token` | `string` | Magic token dari WhatsApp link |

**Response:** HTTP 302 redirect ke `/dashboard` (success) atau JSON error.

**Error Responses:**
| Status | Body |
|---|---|
| 400 | `{ "error": "Token tidak ditemukan" }` |
| 401 | `{ "error": "Token tidak valid atau sudah kadaluarsa" }` |
| 401 | `{ "error": "Token sudah kadaluarsa. Silakan minta link baru di WhatsApp." }` |

### `GET /api/auth/logout`

Hapus `fincore_session` cookie, redirect ke `/login`.

**Response:** HTTP 302 redirect ke `/login`

---

## 2. Transactions

### `GET /api/transactions`

List transaksi user dengan filter, search, dan pagination.

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Halaman |
| `limit` | `number` | `20` | Item per halaman |
| `type` | `string` | — | Filter: `expense`, `income`, `transfer` |
| `categoryId` | `uuid` | — | Filter by category |
| `search` | `string` | — | Search di `name`, `merchant`, `notes` (ILIKE) |
| `dateFrom` | `ISO date` | — | Filter tanggal mulai |
| `dateTo` | `ISO date` | — | Filter tanggal akhir |
| `isConfirmed` | `boolean` | — | Filter confirmed/draft |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Belanja Bulanan",
      "type": "expense",
      "amount": "250000.00",
      "fee": "0.00",
      "totalAmount": "250000.00",
      "currency": "IDR",
      "merchant": "Alfamart",
      "location": "Jakarta",
      "notes": null,
      "sourceType": "text",
      "confidenceScore": null,
      "isConfirmed": true,
      "isDeleted": false,
      "transactionDate": "2026-06-01T10:00:00.000Z",
      "createdAt": "2026-06-01T10:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z",
      "eventId": "uuid",
      "isPublished": false,
      "publishedAt": null,
      "category": { "id": "uuid", "name": "Belanja", "icon": "🛍️" },
      "paymentMethod": { "id": "uuid", "name": "GoPay", "icon": "💚" },
      "toPaymentMethod": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### `POST /api/transactions`

Buat transaksi baru.

**Request Body:**

```json
{
  "name": "string (required)",
  "type": "expense | income | transfer (required)",
  "amount": "number (required, > 0)",
  "fee": "number (default: 0)",
  "currency": "string (default: IDR)",
  "categoryId": "uuid | null",
  "paymentMethodId": "uuid | null",
  "toPaymentMethodId": "uuid | null (required untuk transfer)",
  "merchant": "string | null",
  "location": "string | null",
  "notes": "string | null",
  "transactionDate": "ISO date (default: now)",
  "sourceType": "text | voice | image | document | video (default: text)",
  "isConfirmed": "boolean (default: true)"
}
```

**Response (201):**

```json
{
  "data": {
    /* Transaction object */
  }
}
```

**Error Responses:**
| Status | Body |
|---|---|
| 400 | `{ "error": "Nama, tipe, dan jumlah transaksi wajib diisi" }` |
| 400 | `{ "error": "Jumlah transaksi harus lebih dari 0" }` |

### `GET /api/transactions/:id`

Detail satu transaksi.

**Response (200):** `{ "data": { /* Transaction with relations */ } }`
**Response (404):** `{ "error": "Transaksi tidak ditemukan" }`

### `PATCH /api/transactions/:id`

Update transaksi (partial). Hanya field yang dikirim yang di-update.

**Request Body:** Sama seperti POST, semua field optional. Jika `amount` atau `fee` dikirim, `totalAmount` di-recalculate.

**Response (200):** `{ "data": { /* Updated transaction */ } }`

### `DELETE /api/transactions/:id`

Soft-delete transaksi (set `isDeleted = true`).

**Response (200):** `{ "data": { /* Deleted transaction */ } }`

---

## 3. Stats

### `GET /api/stats`

Summary statistik, category breakdown, monthly trend, dan recent transactions.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `dateFrom` | `ISO date` | Filter tanggal mulai |
| `dateTo` | `ISO date` | Filter tanggal akhir |

**Response (200):**

```json
{
  "summary": {
    "totalExpense": 5000000,
    "totalIncome": 7500000,
    "totalFee": 15000,
    "balance": 2500000,
    "transactionCount": 42
  },
  "categoryBreakdown": [
    {
      "categoryId": "uuid",
      "categoryName": "Makanan & Minuman",
      "categoryIcon": "🍔",
      "categoryColor": null,
      "total": 1500000,
      "count": 12
    }
  ],
  "monthlyTrend": [
    { "month": "2026-01", "expense": "2000000", "income": "3000000" },
    { "month": "2026-02", "expense": "1800000", "income": "2800000" }
  ],
  "recentTransactions": [
    /* 5 most recent transactions */
  ]
}
```

---

## 4. Categories

### `GET /api/categories`

List semua kategori (global defaults + custom user).

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `type` | `string` | Filter: `expense`, `income`, `transfer` |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid | null",
      "name": "Makanan & Minuman",
      "slug": "food",
      "type": "expense",
      "icon": "🍔",
      "color": null,
      "isDefault": true,
      "isActive": true,
      "sortOrder": 1,
      "createdAt": "..."
    }
  ]
}
```

### `POST /api/categories`

Buat kategori custom untuk user.

**Request Body:**

```json
{
  "name": "string (required)",
  "type": "expense | income | transfer (required)",
  "icon": "string (emoji, optional)",
  "color": "string (hex, optional)"
}
```

**Response (201):** `{ "data": { /* Category object */ } }`

---

## 5. Payment Methods

### `GET /api/payment-methods`

List semua metode pembayaran (global defaults + custom user).

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `type` | `string` | Filter: `cash`, `e_wallet`, `bank_transfer`, `credit_card`, `debit_card`, `qris`, `other` |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid | null",
      "name": "GoPay",
      "type": "e_wallet",
      "icon": "💚",
      "color": null,
      "isActive": true,
      "createdAt": "..."
    }
  ]
}
```

### `POST /api/payment-methods`

Buat metode pembayaran custom.

**Request Body:**

```json
{
  "name": "string (required)",
  "type": "cash | e_wallet | bank_transfer | credit_card | debit_card | qris | other (required)",
  "icon": "string (emoji, optional)",
  "color": "string (hex, optional)"
}
```

**Response (201):** `{ "data": { /* PaymentMethod object */ } }`

---

## 6. Tags

### `GET /api/tags`

List semua tag milik user.

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "Liburan",
      "color": "#22c55e",
      "createdAt": "..."
    }
  ]
}
```

### `POST /api/tags`

Buat tag baru.

**Request Body:**

```json
{
  "name": "string (required, unique per user)",
  "color": "string (hex, optional)"
}
```

**Response (201):** `{ "data": { /* Tag object */ } }`

---

## 7. Budgets

### `GET /api/budgets`

List budget user untuk bulan/tahun tertentu. Setiap budget dihitung actual spending-nya dari tabel `transactions`.

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `month` | `number` | current month (1-12) | Bulan |
| `year` | `number` | current year | Tahun |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "categoryId": "uuid",
      "category": {
        "id": "uuid",
        "name": "Makanan & Minuman",
        "icon": "🍔"
      },
      "amount": "1000000.00",
      "month": 6,
      "year": 2026,
      "spent": 750000,
      "percentage": 75,
      "status": "warning"
    }
  ]
}
```

**Status values:**
| Status | Meaning |
|---|---|
| `safe` | `< 80%` terpakai |
| `warning` | `>= 80%` terpakai |
| `over` | `>= 100%` terpakai |

### `POST /api/budgets`

Buat budget baru.

**Request Body:**

```json
{
  "categoryId": "uuid (required)",
  "amount": "number (required)",
  "month": "number 1-12 (required)",
  "year": "number (required)",
  "notes": "string (optional)"
}
```

**Response (201):** `{ "data": { /* Budget object */ } }`

---

## 8. Settings

### `GET /api/settings`

Mengembalikan profil dan preferensi user yang sedang login.

**Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "name": "Budi",
    "phone": "6281234567890",
    "timezone": "Asia/Jakarta",
    "preferredCurrency": "IDR",
    "reportSchedule": "monthly",
    "reportTime": "07:00",
    "onboardedAt": "2026-05-01T...",
    "createdAt": "2026-05-01T...",
    "isActive": true
  }
}
```

### `PATCH /api/settings`

Update profil & preferensi user. Hanya field yang dikirim yang di-update.

**Request Body (semua field optional):**

```json
{
  "name": "string (1-100 karakter)",
  "timezone": "Asia/Jakarta | Asia/Makassar | Asia/Jayapura | UTC",
  "preferredCurrency": "IDR | USD | SGD | MYR | EUR | GBP | JPY | AUD",
  "reportSchedule": "daily | weekly | monthly | off",
  "reportTime": "HH:MM"
}
```

**Response (200):** `{ "data": { /* updated fields */ } }`

**Error Responses:**
| Status | Body |
|---|---|
| 400 | `{ "error": "Nama tidak boleh kosong" }` (atau validasi field lainnya) |
| 400 | `{ "error": "Tidak ada field yang valid untuk di-update" }` |

## 9. Sessions

### `GET /api/sessions`

List semua sesi aktif milik user yang sedang login.

**Response (200):**

```json
{
  "data": [
    {
      "id": "session-uuid",
      "createdAt": "2026-06-01T...",
      "expiresAt": "2026-06-08T...",
      "isCurrent": true,
      "label": "Sesi a1b2c3d4"
    }
  ]
}
```

### `DELETE /api/sessions`

Hapus sesi tertentu (sign out session lain). Tidak bisa digunakan untuk sign out sesi saat ini.

**Request Body:**

```json
{
  "id": "session-uuid"
}
```

**Response (200):** `{ "data": { "deleted": "session-uuid" } }`

**Error Responses:**
| Status | Body |
|---|---|
| 400 | `{ "error": "Tidak bisa mengeluarkan sesi saat ini. Gunakan tombol Keluar untuk logout." }` |
| 404 | `{ "error": "Sesi tidak ditemukan" }` |

---

## 10. Recurring Bills

### `GET /api/recurring-bills`

List semua tagihan berkala user, diurutkan berdasarkan `nextReminderAt`.

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Tagihan Listrik",
      "amount": "500000.00",
      "currency": "IDR",
      "frequency": "MONTHLY",
      "dayOfMonth": 15,
      "nextReminderAt": "2026-06-14T00:00:00.000Z",
      "isActive": true,
      "category": { "name": "Tagihan & Utilitas", "icon": "📄" },
      "paymentMethod": { "name": "BCA", "icon": "🏦" }
    }
  ]
}
```

### `POST /api/recurring-bills`

Buat tagihan berkala baru.

**Request Body:**

```json
{
  "name": "string (required)",
  "amount": "number (optional)",
  "frequency": "DAILY | WEEKLY | MONTHLY | YEARLY (default: MONTHLY)",
  "dayOfMonth": "number 1-31 (optional)",
  "paymentMethodId": "uuid (optional)",
  "categoryId": "uuid (optional)",
  "notes": "string (optional)",
  "nextReminderAt": "ISO date (required)"
}
```

**Response (201):** `{ "data": { /* RecurringBill object */ } }`

---

## 9. Media

### `GET /api/media?p={base64url-encoded-storagePath}`

Serve file media yang disimpan di local storage. Endpoint ini **session-gated** — hanya user yang sudah login (memiliki `fincore_session` cookie) yang bisa mengakses.

**Security:**
| Lapisan | Mekanisme |
|---|---|
| Session gate | Validasi `fincore_session` cookie via `getCurrentUserId()` |
| Obfuscation | `storagePath` di-encode ke base64url → `?p=` parameter |
| Path traversal | Resolved path harus tetap berada di dalam `LOCAL_UPLOAD_DIR` |
| MIME whitelist | Hanya serve: `image/*`, `audio/*`, `video/mp4`, `video/webm`, `application/pdf` |
| Inline disposition | `Content-Disposition: inline` — mencegah forced download |

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `p` | `string` | Base64url-encoded storagePath (format: `local://uploads/{subFolder}/{uuid}.{ext}`) |

**Response (200):** Binary stream dengan header:

```
Content-Type: image/jpeg (atau sesuai MIME)
Content-Length: <file size>
Cache-Control: private, max-age=3600
Content-Disposition: inline
```

**Error Responses:**
| Status | Body |
|---|---|
| 400 | `{ "error": "Invalid or missing media path" }` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Path traversal detected" }` |
| 404 | `{ "error": "Media not found" }` |
| 415 | `{ "error": "Unsupported media type" }` |

**Obfuscation utility:** [`lib/media-url.ts`](apps/dashboard/src/lib/media-url.ts)

- `buildMediaUrl(storagePath)` → `/api/media?p=<base64url>`
- `decodeMediaPath(encoded)` → `local://uploads/...`

---

## Error Handling

Semua endpoint mengembalikan format error yang konsisten:

```json
{
  "error": "Deskripsi error dalam Bahasa Indonesia"
}
```

**HTTP Status codes:**
| Status | Meaning |
|---|---|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) |
| 302 | Redirect (auth) |
| 400 | Bad request / validasi gagal |
| 401 | Unauthorized / token invalid |
| 403 | Forbidden / path traversal |
| 404 | Resource tidak ditemukan |
| 415 | Unsupported media type |
| 500 | Internal server error |
