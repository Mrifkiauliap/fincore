# FinCore Dashboard — Styling Guide

Dokumentasi sistem styling, tema, dan konvensi UI yang digunakan di FinCore Dashboard.

---

## Theme System

Dashboard menggunakan **next-themes** dengan dukungan penuh dark/light mode via class `dark` di `<html>`.

### Provider

[`providers.tsx`](apps/dashboard/src/app/providers.tsx:1) — `ThemeProvider` dari `next-themes`:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

### Toggle

[`theme-toggle.tsx`](apps/dashboard/src/components/theme-toggle.tsx:1) — tombol Sun/Moon dengan animasi rotasi.

```tsx
<ThemeToggle collapsed={false} />
```

| Prop        | Default | Description                              |
| ----------- | ------- | ---------------------------------------- |
| `collapsed` | `false` | Mode ikon saja (untuk sidebar collapsed) |

---

## CSS Variables

Semua warna didefinisikan dalam `oklch` color space di [`globals.css`](apps/dashboard/src/app/globals.css).

### Light Theme (`:root`)

| Variable        | Value                    | Usage                       |
| --------------- | ------------------------ | --------------------------- |
| `--background`  | `oklch(0.987 0.003 253)` | Background halaman          |
| `--foreground`  | `oklch(0.147 0.016 265)` | Text utama                  |
| `--card`        | `oklch(1 0 0)`           | Background card             |
| `--primary`     | `oklch(0.52 0.26 277)`   | Aksen utama (Indigo-Violet) |
| `--muted`       | `oklch(0.955 0.012 255)` | Background muted            |
| `--border`      | `oklch(0.89 0.012 255)`  | Border default              |
| `--destructive` | `oklch(0.58 0.24 28)`    | Error / Delete              |

### Dark Theme (`.dark`)

| Variable       | Value                   | Usage                   |
| -------------- | ----------------------- | ----------------------- |
| `--background` | `oklch(0.128 0.02 270)` | Deep navy background    |
| `--foreground` | `oklch(0.96 0.005 260)` | Text terang             |
| `--card`       | `oklch(0.16 0.02 272)`  | Card dark               |
| `--primary`    | `oklch(0.65 0.26 277)`  | Violet neon             |
| `--muted`      | `oklch(0.2 0.025 268)`  | Muted dark              |
| `--border`     | `oklch(1 0 0 / 10%)`    | Border semi-transparent |

---

## Color Conventions

### Transaction Types

| Type        | CSS Class                                | Usage                    |
| ----------- | ---------------------------------------- | ------------------------ |
| Pemasukan   | `text-emerald-600 dark:text-emerald-400` | Income values, + signs   |
| Pengeluaran | `text-red-500`                           | Expense values, - signs  |
| Transfer    | `text-blue-500`                          | Transfer values, ↔ signs |

### Status Colors

| Status       | Badge Style                                           |
| ------------ | ----------------------------------------------------- |
| Done/Success | `Badge variant="outline"` emerald border/bg           |
| Warning      | `Badge variant="outline"` amber border/bg             |
| Failed       | `Badge variant="destructive"`                         |
| Processing   | `Badge variant="outline"` blue border/bg              |
| Draft        | `Badge variant="outline"` amber `border-amber-500/50` |

### Chart Colors (`--chart-1` to `--chart-5`)

Digunakan untuk visualisasi di dashboard.

| Index | Light                  | Dark                   |
| ----- | ---------------------- | ---------------------- |
| 1     | `oklch(0.62 0.24 280)` | `oklch(0.68 0.24 280)` |
| 2     | `oklch(0.66 0.18 250)` | `oklch(0.72 0.2 252)`  |
| 3     | `oklch(0.7 0.14 200)`  | `oklch(0.76 0.16 200)` |
| 4     | `oklch(0.74 0.16 155)` | `oklch(0.8 0.18 155)`  |
| 5     | `oklch(0.8 0.12 95)`   | `oklch(0.85 0.14 95)`  |

---

## Gradient Utilities

### Card Background Gradients

Digunakan untuk memberi aksen halus pada card:

```tsx
// Emerald (positive/safe)
className = "bg-gradient-to-br from-emerald-500/5 to-transparent";

// Rose (expense/danger)
className = "bg-gradient-to-br from-rose-500/5 to-transparent";

// Violet (AI/insight)
className = "bg-gradient-to-br from-violet-500/5 to-transparent";

// Blue (info/neutral)
className = "bg-gradient-to-br from-blue-500/5 to-transparent";

// Sky (income)
className = "bg-gradient-to-br from-sky-500/5 to-transparent";
```

### Progress Bar Gradients

```tsx
// Success
className = "bg-gradient-to-r from-emerald-400 to-teal-500";

// Danger
className = "bg-gradient-to-r from-red-500 to-rose-500";

// Warning
className = "bg-gradient-to-r from-yellow-400 to-amber-500";

// Primary
className = "bg-gradient-to-r from-violet-500 to-fuchsia-500";

// Category colors (array for multiple bars)
const colors = [
  "bg-gradient-to-r from-violet-500 to-purple-500",
  "bg-gradient-to-r from-blue-500 to-cyan-500",
  "bg-gradient-to-r from-emerald-500 to-teal-500",
  "bg-gradient-to-r from-orange-500 to-amber-500",
  "bg-gradient-to-r from-pink-500 to-rose-500",
  "bg-gradient-to-r from-indigo-500 to-blue-500",
];
```

---

## Custom CSS Utilities (from `globals.css`)

```css
/* Glass morphism card */
.glass-card {
  @apply bg-card/80 backdrop-blur-md border border-border/50;
}

/* Card hover lift */
.card-hover {
  @apply transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5;
}

/* Gradient text */
.gradient-text {
  @apply bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500;
}

/* Fade in animation */
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
```

---

## Typography Scale

| Usage          | Classes                                                         |
| -------------- | --------------------------------------------------------------- |
| Page Title     | `text-2xl font-bold tracking-tight`                             |
| Card Title     | `text-base font-semibold` (or `font-medium`)                    |
| Section Header | `text-sm font-medium text-muted-foreground`                     |
| Body           | `text-sm`                                                       |
| Caption        | `text-xs text-muted-foreground`                                 |
| Monetary       | `font-semibold tabular-nums` (monospaced numbers for alignment) |
| Badge Text     | `text-[10px]`                                                   |

---

## Component Patterns

### StatCard

```tsx
<StatCard
  title="Saldo"
  value={formatCurrency(balance, "IDR")}
  subtitle="42 transaksi"
  icon={Wallet}
  gradient="bg-gradient-to-br from-emerald-500/5 to-transparent"
  textColor="text-emerald-600 dark:text-emerald-400"
/>
```

### Empty State

```tsx
<Card className="border">
  <CardContent className="py-16 text-center text-muted-foreground">
    <SomeIcon className="h-16 w-16 mx-auto mb-4 opacity-20" />
    <p className="text-lg font-medium">Judul</p>
    <p className="text-sm max-w-sm mx-auto mt-1">Deskripsi</p>
  </CardContent>
</Card>
```

### Loading Skeleton

```tsx
<Skeleton className="h-24 w-full rounded-xl" />
```

### Badge Status

```tsx
// Success badge
<Badge variant="outline" className="text-emerald-500 border-emerald-500/50 bg-emerald-500/5 gap-1">
  <CheckCircle2 className="h-3 w-3" />
  Done
</Badge>

// Failed badge
<Badge variant="destructive" className="gap-1">
  <XCircle className="h-3 w-3" />
  Failed
</Badge>
```

---

## Page Rendering Strategy

| Halaman         | Strategy         | Alasan                                |
| --------------- | ---------------- | ------------------------------------- |
| Overview        | Server Component | Query DB langsung, data-heavy         |
| AI Insights     | Client Component | Fetch `/api/insights`, dynamic charts |
| System Logs     | Client Component | Fetch `/api/logs`, filter/pagination  |
| Transactions    | Client Component | TanStack Table, filter interaktif     |
| Edit/Create     | Client Component | Form interaktif                       |
| Categories      | Client Component | Dialog create, dynamic data           |
| Payment Methods | Client Component | Dialog create, dynamic data           |
| Tags            | Client Component | Inline create form                    |
| Budgets         | Client Component | Month/year selector, progress bars    |
| Recurring Bills | Client Component | Dialog create, overdue detection      |
| Settings        | Server Component | Profil user dari session              |

---

## Support Pages

| File                                                          | Purpose                                      |
| ------------------------------------------------------------- | -------------------------------------------- |
| [`not-found.tsx`](apps/dashboard/src/app/not-found.tsx)       | 404 dengan 10s auto-redirect ke `/dashboard` |
| [`error.tsx`](apps/dashboard/src/app/dashboard/error.tsx)     | Error boundary dashboard (network detection) |
| [`loading.tsx`](apps/dashboard/src/app/dashboard/loading.tsx) | Skeleton loading dashboard                   |
| [`global-error.tsx`](apps/dashboard/src/app/global-error.tsx) | Root error boundary (critical failure)       |

---

## Icons (Lucide React)

Semua ikon menggunakan `lucide-react` v1.17.0. Konvensi:

- Ikon halaman: `h-6 w-6` + warna aksen (misal: `text-orange-500` untuk Budget)
- Ikon card title: `h-4 w-4 text-primary`
- Ikon badge: `h-3 w-3`
- Ikon tombol: `h-4 w-4`

---
