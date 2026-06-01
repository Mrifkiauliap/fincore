# FinCore Dashboard — Documentation

## Overview

**FinCore Dashboard** adalah panel monitoring dan manajemen transaksi keuangan berbasis web, dibangun sebagai bagian dari monorepo FinCore. Dashboard berfungsi sebagai layer UI terpisah di atas ingestion layer (API/Worker/Sender), menyediakan antarmuka untuk CRUD transaksi, pemantauan budget, kategori, tag, dan laporan.

**Package name:** `@fincore/dashboard`
**Port:** `3001`
**Base URL:** `/dashboard`

---

## Tech Stack

| Layer             | Technology                                                            | Version           |
| ----------------- | --------------------------------------------------------------------- | ----------------- |
| Framework         | [Next.js](https://nextjs.org) (App Router)                            | 16.2.6            |
| Language          | TypeScript                                                            | 5.x (strict mode) |
| UI Library        | [shadcn/ui](https://ui.shadcn.com) (base-nova)                        | 4.10.0            |
| UI Primitives     | [`@base-ui/react`](https://base-ui.com/react)                         | 1.5.0             |
| Styling           | [Tailwind CSS](https://tailwindcss.com) v4                            | 4.x               |
| Animations        | `tw-animate-css`                                                      | 1.4.0             |
| Icons             | [Lucide React](https://lucide.dev)                                    | 1.17.0            |
| Date Handling     | [dayjs](https://day.js.org)                                           | 1.11.21           |
| Table             | [TanStack React Table](https://tanstack.com/table)                    | 8.21.3            |
| Toast             | [Sonner](https://sonner.emilkowal.ski)                                | 2.0.7             |
| Class Utilities   | `clsx` + `tailwind-merge` + `cva`                                     | —                 |
| ORM               | [Drizzle ORM](https://orm.drizzle.team)                               | 0.45.2            |
| Monorepo Packages | `@fincore/db`, `@fincore/config`, `@fincore/utils`, `@fincore/shared` | workspace         |

> **Note on UI Primitives:** shadcn v4 (`base-nova` style) uses [`@base-ui/react`](https://base-ui.com/react) (by MUI team) as its headless component layer — NOT Radix UI. This means APIs like `asChild` are replaced with `render` props, and `onValueChange` signatures differ from traditional shadcn.

---

## Architecture

```
apps/dashboard/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (TooltipProvider, Toaster)
│   │   ├── page.tsx                  # Redirect / → /dashboard
│   │   ├── globals.css               # Tailwind v4 + shadcn theme + dark mode
│   │   ├── (auth)/login/             # Halaman login (Magic Link via WA)
│   │   ├── api/                      # REST API routes (Next.js Route Handlers)
│   │   │   ├── auth/                 #   GET /verify  — validasi magic token
│   │   │   │                         #   GET /logout  — hapus session cookie
│   │   │   ├── media/                #   GET ?p=       — serve media (session-gated, obfuscated)
│   │   │   ├── transactions/         #   GET/POST      — list & create
│   │   │   │   └── [id]/             #   GET/PATCH/DELETE — detail, update, soft-delete
│   │   │   ├── stats/                #   GET — summary, monthly trend, category breakdown
│   │   │   ├── categories/           #   GET/POST — list & create
│   │   │   ├── payment-methods/      #   GET/POST — list & create
│   │   │   ├── tags/                 #   GET/POST — list & create
│   │   │   ├── budgets/              #   GET/POST — list (with usage) & create
│   │   │   └── recurring-bills/      #   GET/POST — list & create
│   │   └── dashboard/                # Halaman dashboard (protected)
│   │       ├── layout.tsx            # Sidebar + header (collapsible, mobile drawer)
│   │       ├── page.tsx              # Overview: stats, trend chart, reports
│   │       ├── transactions/         # List (TanStack Table, filter, search, paginate)
│   │       │   ├── [id]/edit/        # Form create/edit transaksi
│   │       │   └── new/              # Redirect → /new/edit
│   │       ├── categories/           # Kategori grouped by type (expense/income/transfer)
│   │       ├── payment-methods/      # Metode pembayaran grouped by type
│   │       ├── tags/                 # Tag management (color picker)
│   │       ├── budgets/              # Monthly budget progress bars
│   │       ├── recurring-bills/      # Tagihan berkala with overdue detection
│   │       ├── system/               # System logs: media previews, processing timeline
│   │       └── settings/             # Profil, preferensi laporan, aktivitas
│   ├── components/ui/                # shadcn components (base-nova / @base-ui)
│   ├── lib/
│   │   ├── auth.ts                   # getCurrentUser() — session validation helper
│   │   ├── media-url.ts              # buildMediaUrl() / decodeMediaPath() — obfuscated media URLs
│   │   └── utils.ts                  # cn() — classname merger
│   └── proxy.ts                      # Middleware: session guard (/dashboard), login redirect
├── public/
├── next.config.ts                    # standalone output, transpilePackages
├── components.json                   # shadcn config (base-nova, neutral, lucide)
├── package.json
└── tsconfig.json
```

### Monorepo Context

```
FinCore/                              # pnpm workspace root
├── apps/
│   ├── api/                          # NestJS — WAHA webhook ingestion
│   ├── worker/                       # NestJS — BullMQ job processors (AI, OCR, etc.)
│   ├── sender/                       # NestJS — WhatsApp message sender
│   └── dashboard/                    # Next.js — Panel UI ← YOU ARE HERE
├── packages/
│   ├── db/                           # Drizzle ORM + schema + relations
│   ├── config/                       # Env config loader
│   ├── utils/                        # formatCurrency(), date helpers, string utils
│   ├── shared/                       # Shared types/constants
│   ├── ai/                           # AI providers (Gemini, Groq, Sumopod)
│   ├── queue/                        # BullMQ queue definitions
│   ├── contracts/                    # FinancialEvent type definitions
│   ├── event-publisher/              # Webhook event publishing service
│   ├── storage/                      # S3/MinIO storage provider
│   └── logger/                       # Pino logger wrapper
└── docs/
    ├── database_schema.md            # Full DB schema ERD + table docs
    └── ...
```

---

## Authentication Flow

Dashboard menggunakan **Magic Link via WhatsApp**:

```
User clicks "Buka WhatsApp Bot"
        ↓
Sends "/dashboard" to WAHA bot
        ↓
Worker generates session + magicToken in DB (user_sessions)
        ↓
Bot sends WhatsApp message: "Login: https://dashboard.fincore.dev/api/auth/verify?token=XXX"
        ↓
User clicks link → GET /api/auth/verify?token=XXX
        ↓
Validate: token exists, not expired
        ↓
Clear magicToken (one-time use), extend session expiresAt (+7 days)
        ↓
Set HTTP-Only cookie: fincore_session = session.id
        ↓
Redirect to /dashboard
```

**Session table:** [`user_sessions`](packages/db/src/schema/sessions.ts) — dual purpose:

1. `magicToken` / `magicTokenExpiresAt` — OTP untuk login WA
2. `id` / `expiresAt` — Session ID (Access Token) disimpan di HTTP-Only cookie

**Auth helper:** [`lib/auth.ts`](apps/dashboard/src/lib/auth.ts)

- `getCurrentUser()` — React `cache()` wrapper, query session + user sekali per request, auto-redirect ke `/login`
- `getCurrentUserId()` — Ringan, return `null` jika tidak login (tidak redirect)

**Middleware:** [`proxy.ts`](apps/dashboard/src/proxy.ts) — route guard:

- `/dashboard/**` → redirect ke `/login` jika tidak ada `fincore_session` cookie
- `/login` → redirect ke `/dashboard` jika sudah login

---

## Page Rendering Strategy

| Halaman                             | Strategy             | Alasan                                                      |
| ----------------------------------- | -------------------- | ----------------------------------------------------------- |
| `/dashboard` (Overview)             | **Server Component** | Query DB langsung via `getDb()`, data-heavy stats + reports |
| `/dashboard/settings`               | **Server Component** | Profil user dari session, static data                       |
| `/dashboard/system`                 | **Client Component** | Fetch `/api/logs`, filter, pagination, media previews       |
| `/dashboard/transactions`           | **Client Component** | Filter interaktif, search, TanStack Table, pagination state |
| `/dashboard/transactions/[id]/edit` | **Client Component** | Form interaktif, dynamic select options, API calls          |
| `/dashboard/categories`             | **Client Component** | Dialog create, dynamic data                                 |
| `/dashboard/payment-methods`        | **Client Component** | Dialog create, dynamic data                                 |
| `/dashboard/tags`                   | **Client Component** | Inline create, color picker                                 |
| `/dashboard/budgets`                | **Client Component** | Month/year selector, dynamic progress                       |
| `/dashboard/recurring-bills`        | **Client Component** | Dialog create, dynamic data                                 |

---

## Database Tables Used

| Table                                                                        | Used By                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| [`users`](packages/db/src/schema/users.ts)                                   | Auth, Settings page                         |
| [`user_sessions`](packages/db/src/schema/sessions.ts)                        | Auth validation                             |
| [`raw_messages`](packages/db/src/schema/raw-messages.ts)                     | System Logs page (logs + media previews)    |
| [`ai_processing_logs`](packages/db/src/schema/ai-processing-logs.ts)         | System Logs page (processing timeline)      |
| [`raw_ai_outputs`](packages/db/src/schema/raw-ai-outputs.ts)                 | System Logs page (AI output JSON)           |
| [`transactions`](packages/db/src/schema/transactions.ts)                     | Overview, List, Form (CRUD), Stats          |
| [`transaction_categories`](packages/db/src/schema/transaction-categories.ts) | Form select, Categories page, Budget filter |
| [`payment_methods`](packages/db/src/schema/payment-methods.ts)               | Form select, Payment Methods page           |
| [`transaction_tags`](packages/db/src/schema/transaction-tags.ts)             | Tags page (CRUD)                            |
| [`budgets`](packages/db/src/schema/budgets.ts)                               | Budgets page (monthly tracking)             |
| [`recurring_bills`](packages/db/src/schema/recurring-bills.ts)               | Recurring Bills page                        |
| [`reports`](packages/db/src/schema/reports.ts)                               | Dashboard latest report card                |

---

## Custom SelectValue Pattern

Karena `@base-ui/react` merender raw `value` string di trigger (bukan children dari selected item), semua `Select` di dashboard menggunakan prop custom `labels`:

```tsx
// ❌ Akan menampilkan raw key: "e_wallet", "bank_transfer"
<SelectValue />

// ✅ Menampilkan display label
<SelectValue labels={{ e_wallet: "E-Wallet", bank_transfer: "Bank" }} />
```

Lihat [`select.tsx`](apps/dashboard/src/components/ui/select.tsx) untuk implementasi `SelectValue` yang sudah di-extend.

---

## Development

```bash
# Dari root monorepo
pnpm install

# Start dashboard dev server (port 3001)
cd apps/dashboard
pnpm dev

# Type check
pnpm exec tsc --noEmit --skipLibCheck

# Build
pnpm build

# Add shadcn component
pnpm exec shadcn add [component-name] --yes
```
