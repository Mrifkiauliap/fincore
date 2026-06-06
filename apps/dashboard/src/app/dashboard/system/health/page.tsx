"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HealthData = {
  status: string;
  timestamp: string;
  uptime: number;
  checks: Record<string, { status: string; detail?: string }>;
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "healthy":
    case "ok":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {status}
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
          <RefreshCw className="h-3 w-3" />
          {status}
        </Badge>
      );
    default:
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1">
          <XCircle className="h-3 w-3" />
          {status}
        </Badge>
      );
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export default function HealthPage() {
  const router = useRouter();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      if (res.status === 403) {
        router.push("/dashboard");
        return;
      }
      const json = await res.json();
      setData(json);
      setLastRefresh(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
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
            <Server className="h-6 w-6 text-primary" />
            Health Status
          </h1>
          <p className="text-sm text-muted-foreground">
            System health monitoring
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHealth}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-2 py-3">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-500">{error}</span>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Overall Status */}
          <Card className="border bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Server className="h-8 w-8 text-primary/50" />
                <div>
                  <p className="text-lg font-bold">
                    System <StatusBadge status={data.status} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uptime: {formatUptime(data.uptime)} · Last checked:{" "}
                    {new Date(lastRefresh).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Individual Checks */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.checks).map(([name, check]) => (
              <Card key={name} className="border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {name}
                  </CardTitle>
                  {name === "database" ? (
                    <Database className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Server className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardHeader>
                <CardContent>
                  <StatusBadge status={check.status} />
                  {check.detail && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      {check.detail}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground text-center">
            Timestamp: {data.timestamp}
          </p>
        </>
      )}
    </div>
  );
}
