"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@fincore/utils";
import dayjs from "dayjs";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  DollarSign,
  PieChart,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const rangeOptions = [
  { key: "7d", label: "7 Hari" },
  { key: "30d", label: "1 Bulan" },
  { key: "90d", label: "3 Bulan" },
  { key: "180d", label: "6 Bulan" },
  { key: "365d", label: "1 Tahun" },
];

type InsightsData = {
  dailySpending: { day: string; total: number; count: number }[];
  categoryAnalytics: {
    name: string;
    icon: string;
    total: number;
    count: number;
    avgAmount: number;
    percentage: number;
  }[];
  incomeExpenseRatio: {
    totalIncome: number;
    totalExpense: number;
    totalFee: number;
    netBalance: number;
  };
  weeklyTrend: { week: string; expense: number; income: number }[];
  largestTransactions: any[];
  dayOfWeekSpending: {
    dow: string;
    dowNum: number;
    total: number;
    count: number;
  }[];
  insights: string[];
  period: { days: number; range: string };
};

const dayLabels: Record<string, string> = {
  "Monday   ": "Senin",
  "Tuesday  ": "Selasa",
  Wednesday: "Rabu",
  "Thursday ": "Kamis",
  "Friday   ": "Jumat",
  "Saturday ": "Sabtu",
  "Sunday   ": "Minggu",
};

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/insights?range=${range}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const maxDaily = data
    ? Math.max(...data.dailySpending.map((d) => d.total), 1)
    : 1;

  const maxWeekly = data
    ? Math.max(...data.weeklyTrend.map((w) => Math.max(w.expense, w.income)), 1)
    : 1;

  const savingsRate =
    data && data.incomeExpenseRatio.totalIncome > 0
      ? (data.incomeExpenseRatio.netBalance /
          data.incomeExpenseRatio.totalIncome) *
        100
      : 0;

  // Sort dayOfWeek by dowNum
  const sortedDays =
    data?.dayOfWeekSpending?.toSorted((a, b) => a.dowNum - b.dowNum) ?? [];

  const maxDow =
    sortedDays.length > 0 ? Math.max(...sortedDays.map((d) => d.total), 1) : 1;

  const getInsightIcon = (insight: string) => {
    if (insight.includes("💪") || insight.includes("👍")) return "success";
    if (insight.includes("🔴") || insight.includes("⚠️")) return "warning";
    return "info";
  };

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-500" />
            AI Insights
          </h2>
          <p className="text-muted-foreground">
            Analisis cerdas pola keuangan kamu
          </p>
        </div>
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          {rangeOptions.map((opt) => (
            <button
              type="button"
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                range === opt.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : !data ? (
        <Card className="border">
          <CardContent className="py-16 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Tidak dapat memuat insight</p>
            <p className="text-sm">Coba lagi nanti</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* AI Insight Cards */}
          <div className="grid gap-3">
            {data.insights.map((insight) => {
              const type = getInsightIcon(insight);
              return (
                <div
                  key={insight}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : type === "warning"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-primary/30 bg-primary/5"
                  }`}
                >
                  {type === "success" ? (
                    <Zap className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  ) : type === "warning" ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                  ) : (
                    <Target className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                  )}
                  <p className="text-sm leading-relaxed">{insight}</p>
                </div>
              );
            })}
            {data.insights.length === 0 && (
              <Card className="border">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Belum cukup data untuk memberikan insight</p>
                  <p className="text-sm">
                    Tambahkan transaksi untuk mendapatkan analisis AI
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border bg-gradient-to-br from-emerald-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Savings Rate
                </CardTitle>
                <div className="rounded-full p-1.5 bg-emerald-500/10">
                  <PieChart className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  {savingsRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  dari total pemasukan
                </p>
              </CardContent>
            </Card>

            <Card className="border bg-gradient-to-br from-red-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Pengeluaran
                </CardTitle>
                <div className="rounded-full p-1.5 bg-red-500/10">
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">
                  {formatCurrency(data.incomeExpenseRatio.totalExpense, "IDR")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.period.days} hari terakhir
                </p>
              </CardContent>
            </Card>

            <Card className="border bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Balance
                </CardTitle>
                <div className="rounded-full p-1.5 bg-blue-500/10">
                  <Wallet className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${data.incomeExpenseRatio.netBalance >= 0 ? "text-emerald-500" : "text-red-500"}`}
                >
                  {formatCurrency(data.incomeExpenseRatio.netBalance, "IDR")}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pemasukan - Pengeluaran - Fee
                </p>
              </CardContent>
            </Card>

            <Card className="border bg-gradient-to-br from-violet-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Fee Admin
                </CardTitle>
                <div className="rounded-full p-1.5 bg-violet-500/10">
                  <DollarSign className="h-4 w-4 text-violet-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-500">
                  {formatCurrency(data.incomeExpenseRatio.totalFee, "IDR")}
                </div>
                <p className="text-xs text-muted-foreground">
                  perhatikan metode bayar
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Daily Spending Trend */}
            <Card className="border lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Pengeluaran Harian
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.dailySpending.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Belum ada data
                  </p>
                ) : (
                  <>
                    <div className="flex items-end gap-1 h-32">
                      {data.dailySpending.map((d) => {
                        const h = (d.total / maxDaily) * 100;
                        return (
                          <div
                            key={d.day}
                            className="flex-1 flex flex-col items-center min-w-0"
                            title={`${dayjs(d.day).format("DD MMM")}: ${formatCurrency(d.total, "IDR")}`}
                          >
                            <div
                              className="w-full max-w-[8px] bg-rose-500/60 hover:bg-rose-500 rounded-t transition-all"
                              style={{ height: `${Math.max(h, 2)}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                      <span>
                        {dayjs(data.dailySpending[0]?.day).format("DD MMM")}
                      </span>
                      <span>
                        {dayjs(
                          data.dailySpending[data.dailySpending.length - 1]
                            ?.day,
                        ).format("DD MMM")}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown Pie */}
            <Card className="border lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Kategori Teratas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.categoryAnalytics.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Belum ada data
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {data.categoryAnalytics.slice(0, 6).map((cat) => (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate">
                            {cat.icon} {cat.name}
                          </span>
                          <span className="font-medium tabular-nums ml-2 shrink-0">
                            {cat.percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                            style={{
                              width: `${Math.min(cat.percentage, 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {formatCurrency(cat.total, "IDR")} · {cat.count}{" "}
                          transaksi · avg {formatCurrency(cat.avgAmount, "IDR")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Weekly Trend */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Tren Mingguan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.weeklyTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Belum ada data
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.weeklyTrend.map((w) => {
                      const weekLabel = dayjs(w.week).format("DD MMM");
                      return (
                        <div key={w.week} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {weekLabel}
                            </span>
                            <div className="flex gap-3 tabular-nums">
                              {w.income > 0 && (
                                <span className="text-emerald-500">
                                  +{formatCurrency(w.income, "IDR")}
                                </span>
                              )}
                              {w.expense > 0 && (
                                <span className="text-red-500">
                                  -{formatCurrency(w.expense, "IDR")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-emerald-500/70"
                              style={{
                                width: `${(w.income / maxWeekly) * 100}%`,
                              }}
                            />
                            <div
                              className="h-full bg-red-500/70"
                              style={{
                                width: `${(w.expense / maxWeekly) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Day of Week Pattern */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Pola Hari
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Belum ada data
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sortedDays.map((d) => {
                      const displayDay = dayLabels[d.dow] || d.dow.trim();
                      const width = (d.total / maxDow) * 100;
                      return (
                        <div
                          key={d.dow}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="w-14 text-muted-foreground shrink-0">
                            {displayDay}
                          </span>
                          <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all flex items-center justify-end pr-1.5"
                              style={{ width: `${Math.max(width, 2)}%` }}
                            >
                              {width > 25 && (
                                <span className="text-[10px] text-white font-medium">
                                  {formatCurrency(d.total, "IDR")}
                                </span>
                              )}
                            </div>
                          </div>
                          {width <= 25 && (
                            <span className="text-muted-foreground tabular-nums w-20 text-right shrink-0">
                              {formatCurrency(d.total, "IDR")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Largest Transactions */}
          {data.largestTransactions.length > 0 && (
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Transaksi Terbesar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y -mx-2">
                  {data.largestTransactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-2 py-2.5"
                    >
                      <div className="shrink-0 rounded-full p-1.5 bg-muted">
                        {tx.type === "income" ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                        ) : tx.type === "expense" ? (
                          <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {tx.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.category?.icon} {tx.category?.name || "—"} ·{" "}
                          {dayjs(tx.transactionDate).format("DD MMM")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-medium tabular-nums ${
                            tx.type === "income"
                              ? "text-emerald-500"
                              : tx.type === "expense"
                                ? "text-red-500"
                                : "text-blue-500"
                          }`}
                        >
                          {formatCurrency(tx.amount, "IDR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
