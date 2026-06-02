import { getCurrentUser } from "@/lib/auth";
import { getDb, transactions, reports, type ReportData } from "@fincore/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@fincore/utils";
import dayjs from "dayjs";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ChartArea,
  FileText,
  Sparkles,
  PiggyBank,
  Target,
  Calendar,
} from "lucide-react";
import Link from "next/link";

type RangeKey = "7d" | "30d" | "90d" | "180d" | "365d";

interface RangeOption {
  key: RangeKey;
  label: string;
  days: number;
}

const rangeOptions: RangeOption[] = [
  { key: "7d", label: "7 Hari", days: 7 },
  { key: "30d", label: "1 Bulan", days: 30 },
  { key: "90d", label: "3 Bulan", days: 90 },
  { key: "180d", label: "6 Bulan", days: 180 },
  { key: "365d", label: "1 Tahun", days: 365 },
];

async function getDashboardData(userId: string, rangeDays: number) {
  const db = getDb();
  const rangeStart = dayjs().subtract(rangeDays, "day").startOf("day").toDate();
  const now = new Date();

  // Parallelize independent queries
  const startOfMonth = dayjs().startOf("month").toDate();
  const sixMonthsAgo = dayjs().subtract(6, "month").startOf("month").toDate();

  const [
    [rangeSummary],
    [allTime],
    [mtd],
    monthlyTrend,
    categoryBreakdown,
    recentTransactions,
    latestReport,
  ] = await Promise.all([
    // Summary for selected range
    db
      .select({
        totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          eq(transactions.isConfirmed, true),
          gte(transactions.transactionDate, rangeStart),
        ),
      ),
    // All-time summary
    db
      .select({
        totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          eq(transactions.isConfirmed, true),
        ),
      ),
    // Month-to-date
    db
      .select({
        totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          eq(transactions.isConfirmed, true),
          gte(transactions.transactionDate, startOfMonth),
        ),
      ),
    // Monthly trend (last 6 months)
    db
      .select({
        month: sql<string>`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`,
        expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          eq(transactions.isConfirmed, true),
          gte(transactions.transactionDate, sixMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`),
    // Category breakdown for range
    db
      .select({
        name: sql<string>`COALESCE(tc.name, 'Tanpa Kategori')`,
        icon: sql<string>`tc.icon`,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .leftJoin(
        sql`transaction_categories tc`,
        sql`${transactions.categoryId} = tc.id`,
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          eq(transactions.isConfirmed, true),
          eq(transactions.type, "expense"),
          gte(transactions.transactionDate, rangeStart),
        ),
      )
      .groupBy(sql`tc.name`, sql`tc.icon`)
      .orderBy(sql`COALESCE(SUM(${transactions.amount}), 0) DESC`)
      .limit(6),
    // Recent transactions
    db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
      ),
      with: {
        category: true,
        paymentMethod: true,
      },
      orderBy: desc(transactions.transactionDate),
      limit: 8,
    }),
    // Latest report
    db.query.reports.findFirst({
      where: eq(reports.userId, userId),
      orderBy: desc(reports.createdAt),
    }),
  ]);

  // Savings rate
  const rangeIncome = Number(rangeSummary?.totalIncome ?? 0);
  const rangeExpense = Number(rangeSummary?.totalExpense ?? 0);
  const savingsRate =
    rangeIncome > 0 ? ((rangeIncome - rangeExpense) / rangeIncome) * 100 : 0;

  return {
    rangeSummary: {
      totalExpense: rangeExpense,
      totalIncome: rangeIncome,
      balance: rangeIncome - rangeExpense,
      count: rangeSummary?.count ?? 0,
      savingsRate,
    },
    mtd: {
      totalExpense: Number(mtd?.totalExpense ?? 0),
      totalIncome: Number(mtd?.totalIncome ?? 0),
      balance: Number(mtd?.totalIncome ?? 0) - Number(mtd?.totalExpense ?? 0),
      count: mtd?.count ?? 0,
    },
    allTime: {
      totalExpense: Number(allTime?.totalExpense ?? 0),
      totalIncome: Number(allTime?.totalIncome ?? 0),
      balance:
        Number(allTime?.totalIncome ?? 0) - Number(allTime?.totalExpense ?? 0),
      count: allTime?.count ?? 0,
    },
    monthlyTrend: monthlyTrend.map((m) => ({
      ...m,
      expense: Number(m.expense),
      income: Number(m.income),
    })),
    categoryBreakdown,
    recentTransactions,
    latestReport: latestReport
      ? {
          type: latestReport.type,
          periodStart: latestReport.periodStart,
          periodEnd: latestReport.periodEnd,
          data: latestReport.data as ReportData,
        }
      : null,
  };
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  textColor,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  gradient: string;
  textColor: string;
}) {
  return (
    <Card className={`border overflow-hidden relative ${gradient}`}>
      <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full bg-white/[0.03]" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={`rounded-xl p-2 bg-background/80 backdrop-blur shadow-sm`}
        >
          <Icon className={`h-4 w-4 ${textColor}`} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className={`text-2xl font-bold tracking-tight ${textColor}`}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function typeConfig(type: string) {
  switch (type) {
    case "income":
      return {
        label: "Pemasukan",
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        icon: ArrowUpRight,
      };
    case "expense":
      return {
        label: "Pengeluaran",
        color: "text-red-500",
        bg: "bg-red-500/10",
        icon: ArrowDownRight,
      };
    case "transfer":
      return {
        label: "Transfer",
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        icon: ArrowRightLeft,
      };
    default:
      return {
        label: type,
        color: "text-muted-foreground",
        bg: "bg-muted",
        icon: Receipt,
      };
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const rangeParam = (sp.range as RangeKey) || "30d";
  const rangeDays = rangeOptions.find((r) => r.key === rangeParam)?.days ?? 30;
  const data = await getDashboardData(user.id, rangeDays);

  const maxCat =
    data.categoryBreakdown.length > 0
      ? Math.max(...data.categoryBreakdown.map((c) => c.total))
      : 1;

  const maxMonthly = Math.max(
    ...data.monthlyTrend.map((m) => Math.max(m.expense, m.income)),
    1,
  );

  const monthLabel = (ym: string) => {
    const d = dayjs(ym + "-01");
    return d.format("MMM YY");
  };

  const rangeLabel =
    rangeOptions.find((r) => r.key === rangeParam)?.label ?? "1 Bulan";

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Selamat datang, {user.name || "User"}
            <span className="text-sm font-normal text-muted-foreground">
              👋
            </span>
          </h2>
          <p className="text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {dayjs().format("dddd, DD MMMM YYYY")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time range tabs */}
          <div className="flex rounded-xl border bg-muted/40 p-1">
            {rangeOptions.map((opt) => (
              <Link
                key={opt.key}
                href={`/dashboard?range=${opt.key}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  rangeParam === opt.key
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <Link
            href="/dashboard/transactions/new/edit"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium h-9 px-4 transition-all shadow-sm hover:shadow-md"
          >
            <span className="text-lg leading-none">+</span> Tambah
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={`Saldo (${rangeLabel})`}
          value={formatCurrency(data.rangeSummary.balance, "IDR")}
          subtitle={`${data.rangeSummary.count} transaksi`}
          icon={Wallet}
          gradient="bg-gradient-to-br from-emerald-500/5 via-emerald-500/[0.02] to-transparent"
          textColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Pemasukan (Bulan Ini)"
          value={formatCurrency(data.mtd.totalIncome, "IDR")}
          subtitle={`${data.mtd.count} transaksi bulan ini`}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-sky-500/5 via-sky-500/[0.02] to-transparent"
          textColor="text-sky-600 dark:text-sky-400"
        />
        <StatCard
          title="Pengeluaran (Bulan Ini)"
          value={formatCurrency(data.mtd.totalExpense, "IDR")}
          icon={TrendingDown}
          gradient="bg-gradient-to-br from-rose-500/5 via-rose-500/[0.02] to-transparent"
          textColor="text-rose-600 dark:text-rose-400"
        />
        <StatCard
          title="Savings Rate"
          value={`${data.rangeSummary.savingsRate.toFixed(1)}%`}
          subtitle={
            data.rangeSummary.savingsRate >= 50
              ? "💪 Sangat sehat!"
              : data.rangeSummary.savingsRate >= 20
                ? "👍 Cukup baik"
                : data.rangeSummary.savingsRate >= 0
                  ? "⚠️ Perlu ditingkatkan"
                  : "🔴 Defisit"
          }
          icon={PiggyBank}
          gradient="bg-gradient-to-br from-violet-500/5 via-violet-500/[0.02] to-transparent"
          textColor="text-violet-600 dark:text-violet-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Monthly Trend Chart */}
        <Card className="lg:col-span-4 border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tren Bulanan (6 Bulan)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ChartArea className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Belum ada data transaksi</p>
                <p className="text-xs">
                  Mulai catat transaksi untuk melihat tren
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Chart bars with axis */}
                <div className="flex items-end gap-1 h-44 px-1">
                  {/* Y-axis grid lines */}
                  <div className="absolute left-0 right-0 h-44 flex flex-col justify-between pointer-events-none px-8">
                    <div className="border-t border-border/30 h-0" />
                    <div className="border-t border-border/30 h-0" />
                    <div className="border-t border-border/30 h-0" />
                    <div className="border-t border-border/30 h-0" />
                  </div>
                  {data.monthlyTrend.map((m) => {
                    const expHeight =
                      maxMonthly > 0 ? (m.expense / maxMonthly) * 100 : 0;
                    const incHeight =
                      maxMonthly > 0 ? (m.income / maxMonthly) * 100 : 0;
                    return (
                      <div
                        key={m.month}
                        className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative"
                      >
                        <div className="flex items-end gap-[2px] w-full justify-center h-36">
                          {/* Tooltip on hover via title */}
                          <div
                            className="w-[10px] bg-gradient-to-t from-red-500/80 to-red-400/60 rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${Math.max(expHeight, 2)}%` }}
                            title={`Pengeluaran: ${formatCurrency(m.expense, "IDR")}`}
                          />
                          <div
                            className="w-[10px] bg-gradient-to-t from-emerald-500/80 to-emerald-400/60 rounded-t-sm hover:brightness-110 transition-all"
                            style={{ height: `${Math.max(incHeight, 2)}%` }}
                            title={`Pemasukan: ${formatCurrency(m.income, "IDR")}`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {monthLabel(m.month)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-6 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-gradient-to-t from-red-500/80 to-red-400/60" />{" "}
                    Pengeluaran
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-gradient-to-t from-emerald-500/80 to-emerald-400/60" />{" "}
                    Pemasukan
                  </span>
                </div>
                {/* Summary table */}
                <div className="mt-4 space-y-0.5">
                  {[...data.monthlyTrend].reverse().map((m) => (
                    <div
                      key={m.month}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <span className="text-muted-foreground font-medium w-14">
                        {monthLabel(m.month)}
                      </span>
                      <div className="flex gap-4 tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {m.income > 0
                            ? `+${formatCurrency(m.income, "IDR")}`
                            : formatCurrency(m.income, "IDR")}
                        </span>
                        <span className="text-red-500">
                          {formatCurrency(m.expense, "IDR")}
                        </span>
                        <span
                          className={`font-medium ${
                            m.income - m.expense >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500"
                          }`}
                        >
                          {formatCurrency(m.income - m.expense, "IDR")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown + Latest Report */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="border overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-500" />
                Kategori Teratas ({rangeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.categoryBreakdown.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <ChartArea className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">Belum ada transaksi</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.categoryBreakdown.map((cat, idx) => {
                    const pct = (cat.total / maxCat) * 100;
                    const colors = [
                      "bg-gradient-to-r from-violet-500 to-purple-500",
                      "bg-gradient-to-r from-blue-500 to-cyan-500",
                      "bg-gradient-to-r from-emerald-500 to-teal-500",
                      "bg-gradient-to-r from-orange-500 to-amber-500",
                      "bg-gradient-to-r from-pink-500 to-rose-500",
                      "bg-gradient-to-r from-indigo-500 to-blue-500",
                    ];
                    return (
                      <div key={cat.name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">
                            {cat.icon} {cat.name}
                          </span>
                          <span className="font-semibold tabular-nums ml-2 shrink-0">
                            {formatCurrency(cat.total, "IDR")}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${colors[idx % colors.length]}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {cat.count} transaksi
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Latest Report Card */}
          {data.latestReport && (
            <Card className="border overflow-hidden bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  Laporan Terakhir
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {dayjs(data.latestReport.periodStart).format("DD MMM")} –{" "}
                  {dayjs(data.latestReport.periodEnd).format("DD MMM YYYY")}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-background/50 rounded-lg p-2.5">
                    <span className="text-muted-foreground text-xs">
                      Pemasukan
                    </span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {formatCurrency(
                        data.latestReport.data.totalIncome,
                        "IDR",
                      )}
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2.5">
                    <span className="text-muted-foreground text-xs">
                      Pengeluaran
                    </span>
                    <p className="font-semibold text-red-500 tabular-nums mt-0.5">
                      {formatCurrency(
                        data.latestReport.data.totalExpense,
                        "IDR",
                      )}
                    </p>
                  </div>
                  <div className="col-span-2 bg-background/50 rounded-lg p-2.5">
                    <span className="text-muted-foreground text-xs">
                      Saldo Bersih
                    </span>
                    <p
                      className={`font-bold tabular-nums mt-0.5 text-lg ${
                        data.latestReport.data.netBalance >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500"
                      }`}
                    >
                      {formatCurrency(data.latestReport.data.netBalance, "IDR")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick link to AI Insights */}
          <Link href="/dashboard/insights" className="block">
            <Card className="border bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-fuchsia-500/5 hover:from-violet-500/10 hover:via-purple-500/10 hover:to-fuchsia-500/10 transition-all cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-full p-2 bg-violet-500/10 group-hover:bg-violet-500/20 transition-colors">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">AI Insights</p>
                  <p className="text-xs text-muted-foreground">
                    Lihat analisis dan rekomendasi cerdas
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Transactions */}
      <Card className="border overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Transaksi Terbaru
          </CardTitle>
          <Link
            href="/dashboard/transactions"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            Lihat semua →
          </Link>
        </CardHeader>
        <CardContent>
          {data.recentTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Belum ada transaksi</p>
              <Link
                href="/dashboard/transactions/new/edit"
                className="text-xs text-primary hover:underline mt-1"
              >
                Catat transaksi pertama →
              </Link>
            </div>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {data.recentTransactions.map((tx) => {
                const cfg = typeConfig(tx.type);
                return (
                  <Link
                    key={tx.id}
                    href={`/dashboard/transactions/${tx.id}/edit`}
                    className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/40 transition-all group"
                  >
                    <div className={`shrink-0 rounded-xl p-2 ${cfg.bg}`}>
                      <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {tx.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tx.category?.icon} {tx.category?.name || "—"} ·{" "}
                        {tx.paymentMethod?.icon} {tx.paymentMethod?.name || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          tx.type === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : tx.type === "expense"
                              ? "text-red-500"
                              : "text-blue-500"
                        }`}
                      >
                        {tx.type === "income"
                          ? "+"
                          : tx.type === "expense"
                            ? "−"
                            : "↔"}{" "}
                        {formatCurrency(tx.amount, tx.currency || "IDR")}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {dayjs(tx.transactionDate).format("DD/MM")}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
