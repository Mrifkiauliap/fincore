"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dayjs from "dayjs";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  DollarSign,
  TrendingUp,
  Users2,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type OverviewData = {
  days: number;
  totals: { total: number; latestEvent: string | null };
  byCategory: { category: string; count: number }[];
  byEvent: { event: string; count: number }[];
};

type AiData = {
  summary: {
    totalExtractions: number;
    totalFailures: number;
    avgLatencyMs: number;
    avgTokens: number;
    totalCost: number;
    mostUsedModel: string;
  };
  daily: { day: string; completed: number; failed: number }[];
};

type UsersData = {
  summary: { totalOnboarded: number; totalLogins: number; uniqueUsers: number };
  daily: { day: string; uniqueUsers: number }[];
};

const CATEGORY_COLORS: Record<string, string> = {
  ai: "text-violet-500",
  user: "text-blue-500",
  transaction: "text-emerald-500",
  queue: "text-amber-500",
  system: "text-slate-500",
};

const CATEGORY_BG: Record<string, string> = {
  ai: "bg-violet-500/10",
  user: "bg-blue-500/10",
  transaction: "bg-emerald-500/10",
  queue: "bg-amber-500/10",
  system: "bg-slate-500/10",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [aiData, setAiData] = useState<AiData | null>(null);
  const [usersData, setUsersData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, aiRes, usersRes] = await Promise.all([
        fetch(`/api/analytics?metric=overview&days=${days}`),
        fetch(`/api/analytics?metric=ai&days=${days}`),
        fetch(`/api/analytics?metric=users&days=${days}`),
      ]);

      if (overviewRes.status === 403) {
        setAuthorized(false);
        router.push("/dashboard");
        return;
      }

      setAuthorized(true);
      setOverview(await overviewRes.json());
      setAiData(await aiRes.json());
      setUsersData(await usersRes.json());
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
    }
  }, [days, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Product usage & AI performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                days === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* No data state */}
      {overview && overview.totals.total === 0 && (
        <Card className="border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              Belum ada data analitik
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
              Event akan mulai terekam setelah processor memanggil{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                trackEvent()
              </code>{" "}
              dari{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                @fincore/db
              </code>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      {overview && overview.totals.total > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Activity}
              label="Total Events"
              value={overview.totals.total.toLocaleString()}
              sub={`${days} hari terakhir`}
              color="text-primary"
            />
            <StatCard
              icon={Users2}
              label="Unique Users"
              value={usersData?.summary.uniqueUsers.toLocaleString() ?? "0"}
              sub={`${usersData?.summary.totalLogins ?? 0} logins`}
              color="text-blue-500"
            />
            <StatCard
              icon={BrainCircuit}
              label="AI Extractions"
              value={(aiData?.summary.totalExtractions ?? 0).toLocaleString()}
              sub={
                aiData
                  ? `${((aiData.summary.totalFailures / Math.max(aiData.summary.totalExtractions, 1)) * 100).toFixed(1)}% failure`
                  : "—"
              }
              color="text-violet-500"
            />
            <StatCard
              icon={DollarSign}
              label="AI Cost (est.)"
              value={`$${Number(aiData?.summary.totalCost ?? 0).toFixed(4)}`}
              sub={
                aiData
                  ? `~${aiData.summary.avgTokens.toLocaleString()} avg tokens`
                  : "—"
              }
              color="text-amber-500"
            />
          </div>

          {/* Detail Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList
              variant="line"
              className="w-full border-b border-border px-2"
            >
              <TabsTrigger value="overview" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Events
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5">
                <BrainCircuit className="h-3.5 w-3.5" />
                AI Performance
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5">
                <Users2 className="h-3.5 w-3.5" />
                Users
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="pt-4 space-y-4">
              {/* By Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Events by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {overview.byCategory.map((cat) => {
                      const pct =
                        overview.totals.total > 0
                          ? (cat.count / overview.totals.total) * 100
                          : 0;
                      return (
                        <div
                          key={cat.category}
                          className="flex items-center gap-3"
                        >
                          <span className="text-xs font-medium w-24 capitalize">
                            {cat.category}
                          </span>
                          <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${CATEGORY_BG[cat.category] || "bg-primary/10"}`}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                            {cat.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top Events */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Top Events ({overview.byEvent.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {overview.byEvent.slice(0, 15).map((ev, i) => (
                      <div
                        key={ev.event}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-6">
                            #{i + 1}
                          </span>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono max-w-[300px] truncate">
                            {ev.event}
                          </code>
                        </div>
                        <span className="text-xs font-mono tabular-nums">
                          {ev.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Tab */}
            <TabsContent value="ai" className="pt-4">
              {aiData ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard
                      icon={Zap}
                      label="Avg Latency"
                      value={
                        aiData.summary.avgLatencyMs > 0
                          ? aiData.summary.avgLatencyMs < 1000
                            ? `${aiData.summary.avgLatencyMs}ms`
                            : `${(aiData.summary.avgLatencyMs / 1000).toFixed(1)}s`
                          : "—"
                      }
                      color="text-violet-500"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Success Rate"
                      value={`${((aiData.summary.totalExtractions / Math.max(aiData.summary.totalExtractions + aiData.summary.totalFailures, 1)) * 100).toFixed(1)}%`}
                      sub={`${aiData.summary.totalFailures} failures`}
                      color="text-emerald-500"
                    />
                    <StatCard
                      icon={BrainCircuit}
                      label="Most Used Model"
                      value={aiData.summary.mostUsedModel}
                      sub={`${aiData.summary.avgTokens.toLocaleString()} avg tokens`}
                      color="text-blue-500"
                    />
                  </div>

                  {/* Daily AI trend */}
                  {aiData.daily.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium">
                          Daily AI Usage
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {aiData.daily.map((d) => (
                            <div
                              key={d.day}
                              className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                            >
                              <span className="font-mono w-28">
                                {dayjs(d.day).format("MMM DD")}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-500 tabular-nums">
                                  {d.completed} done
                                </span>
                                {d.failed > 0 && (
                                  <span className="text-red-500 tabular-nums">
                                    {d.failed} failed
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No AI extraction data yet
                </p>
              )}
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="pt-4">
              {usersData ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                      icon={Users2}
                      label="Unique Users"
                      value={usersData.summary.uniqueUsers.toLocaleString()}
                      color="text-blue-500"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="New Onboarded"
                      value={usersData.summary.totalOnboarded.toLocaleString()}
                      sub={`${days} hari terakhir`}
                      color="text-emerald-500"
                    />
                    <StatCard
                      icon={Activity}
                      label="Total Logins"
                      value={usersData.summary.totalLogins.toLocaleString()}
                      sub="via magic link"
                      color="text-violet-500"
                    />
                  </div>

                  {/* DAU trend */}
                  {usersData.daily.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium">
                          Daily Active Users
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {usersData.daily.map((d) => (
                            <div
                              key={d.day}
                              className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                            >
                              <span className="font-mono w-28">
                                {dayjs(d.day).format("MMM DD")}
                              </span>
                              <span className="text-blue-500 tabular-nums font-medium">
                                {d.uniqueUsers} users
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No user activity data yet
                </p>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
