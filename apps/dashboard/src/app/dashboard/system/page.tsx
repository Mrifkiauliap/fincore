"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildMediaUrl,
  getMediaPlaceholderClass,
  isPreviewableType,
} from "@/lib/media-url";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Code,
  Copy,
  Cpu,
  Eye,
  ImageIcon,
  Music,
  Search,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LogData = {
  id: string;
  waMessageId: string;
  from: string;
  type: string;
  body: string | null;
  processingStatus: string;
  createdAt: string;
  rawPayload: any;
  aiOutputs: any[];
  processingLogs: any[];
  storagePath?: string | null;
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
};

type StatsData = {
  total: number;
  done: number;
  failed: number;
  processing: number;
  pending: number;
  skipped: number;
  avgDuration: number;
  successRate: number;
};

// ─── Type icon helper (module-level) ─────────────────────────────────
function getTypeIcon(type: string) {
  switch (type) {
    case "text":
      return "💬";
    case "voice":
      return "🎤";
    case "image":
      return "🖼️";
    case "document":
      return "📄";
    case "video":
      return "🎬";
    default:
      return "📨";
  }
}

// ─── Copy button component ───────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity"
      onClick={handleCopy}
    >
      {copied ? (
        <ClipboardCopy className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ─── Thumbnail for table cell ─────────────────────────────────────────
function MediaThumbnail({ log }: { log: LogData }) {
  const mediaUrl = buildMediaUrl(log.storagePath);

  if (log.type === "image" && mediaUrl) {
    return (
      <div className="relative size-10 rounded-md overflow-hidden border bg-muted/30 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="preview"
          className="size-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove(
              "hidden",
            );
          }}
        />
        <div className="hidden size-full flex items-center justify-center bg-muted/50">
          <ImageIcon className="size-4 text-muted-foreground/40" />
        </div>
      </div>
    );
  }

  if (isPreviewableType(log.type)) {
    const placeholderClass = getMediaPlaceholderClass(log.type);
    return (
      <div
        className={cn(
          "size-10 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0",
          placeholderClass,
        )}
      >
        {getTypeIcon(log.type)}
      </div>
    );
  }

  return null;
}

// ─── Processing Timeline ──────────────────────────────────────────────
function ProcessingTimeline({ steps }: { steps: any[] }) {
  if (!steps || steps.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        <Cpu className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p>Tidak ada langkah pemrosesan</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

      <div className="space-y-0">
        {steps.map((step: any, idx: number) => {
          const isDone = step.status === "done";
          const isFailed = step.status === "failed";
          const isRunning =
            step.status === "processing" || step.status === "running";

          return (
            <div
              key={step.step || idx}
              className="relative flex gap-4 pb-3 last:pb-0"
            >
              {/* Dot on timeline */}
              <div className="relative z-10 mt-1.5 shrink-0">
                <div
                  className={cn(
                    "size-[22px] rounded-full border-2 flex items-center justify-center bg-card transition-colors",
                    isDone &&
                      "border-emerald-500 bg-emerald-500/10 text-emerald-500",
                    isFailed && "border-red-500 bg-red-500/10 text-red-500",
                    isRunning && "border-blue-500 bg-blue-500/10 text-blue-500",
                    !isDone &&
                      !isFailed &&
                      !isRunning &&
                      "border-muted-foreground/30 text-muted-foreground/50",
                  )}
                >
                  {isDone && <CheckCircle2 className="size-3" />}
                  {isFailed && <XCircle className="size-3" />}
                  {isRunning && <Activity className="size-3 animate-pulse" />}
                  {!isDone && !isFailed && !isRunning && (
                    <span className="text-[10px] font-mono font-bold">
                      {idx + 1}
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm font-semibold">{step.step}</strong>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5",
                      isDone && "border-emerald-500/50 text-emerald-500",
                      isFailed && "border-red-500/50 text-red-500",
                      isRunning && "border-blue-500/50 text-blue-500",
                    )}
                  >
                    {step.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                    {step.durationMs
                      ? step.durationMs < 1000
                        ? `${step.durationMs}ms`
                        : `${(step.durationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </span>
                </div>
                {step.provider && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Provider:{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                      {step.provider}
                    </code>
                  </div>
                )}
                {step.error && (
                  <div className="text-destructive text-xs mt-1.5 bg-destructive/5 p-2 rounded border border-destructive/20">
                    {step.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── JSON Block with copy ─────────────────────────────────────────────
function JsonBlock({
  label,
  data,
  highlightColor = "text-emerald-400",
}: {
  label: string;
  data: any;
  highlightColor?: string;
}) {
  const jsonStr = JSON.stringify(data, null, 2);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="relative group/json">
        <CopyButton text={jsonStr} />
        <pre
          className={cn(
            "bg-zinc-950 dark:bg-zinc-900 p-4 pr-10 rounded-lg text-xs whitespace-pre-wrap break-all font-mono border border-zinc-800 overflow-x-auto max-h-[400px] overflow-y-auto",
            highlightColor,
          )}
        >
          {jsonStr}
        </pre>
      </div>
    </div>
  );
}

// ─── Media Preview in Dialog ──────────────────────────────────────────
function MediaPreview({ log }: { log: LogData }) {
  const mediaUrl = buildMediaUrl(log.storagePath);

  if (!mediaUrl && !log.mediaUrl) {
    if (isPreviewableType(log.type)) {
      return (
        <div className="flex items-center justify-center h-48 bg-muted/20 rounded-lg border border-dashed border-border">
          <div className="text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Media tidak tersedia di storage lokal</p>
            {log.mediaUrl && (
              <p className="text-xs mt-1 opacity-50 truncate max-w-[300px]">
                URL: {log.mediaUrl}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  }

  if (log.type === "image" && mediaUrl) {
    return (
      <div className="rounded-lg overflow-hidden border bg-muted/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="Media preview"
          className="w-full max-h-[400px] object-contain"
        />
      </div>
    );
  }

  if (log.type === "video" && mediaUrl) {
    return (
      <div className="rounded-lg overflow-hidden border bg-black">
        <video controls className="w-full max-h-[400px]" preload="metadata">
          <source src={mediaUrl} />
        </video>
      </div>
    );
  }

  if (log.type === "voice" && mediaUrl) {
    return (
      <div className="rounded-lg border bg-muted/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Music className="size-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium">Voice Note</p>
            <p className="text-xs text-muted-foreground">
              {log.mediaMimetype ?? "audio"}
            </p>
          </div>
        </div>
        <audio controls className="w-full" preload="metadata">
          <source src={mediaUrl} />
        </audio>
      </div>
    );
  }

  if (log.type === "document" && mediaUrl) {
    const isPdf = log.mediaMimetype?.includes("pdf");
    return (
      <div className="rounded-lg border bg-muted/10 p-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Eye className="size-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Document</p>
            <p className="text-xs text-muted-foreground">
              {log.mediaMimetype ?? "unknown"}
            </p>
          </div>
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {isPdf ? "Open PDF" : "Download"}
          </a>
        </div>
      </div>
    );
  }

  return null;
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    done: 0,
    failed: 0,
    processing: 0,
    pending: 0,
    skipped: 0,
    avgDuration: 0,
    successRate: 0,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
      });
      if (search) params.append("search", search);
      if (status && status !== "all") params.append("status", status);

      const res = await fetch(`/api/logs?${params.toString()}`);
      const result = await res.json();

      if (result.data) {
        setLogs(result.data);
        setTotalPages(result.pagination.totalPages);
        setHasNext(result.pagination.hasNext);
        setHasPrev(result.pagination.hasPrev);
        setTotal(result.pagination.total);

        // Compute stats from first load (full dataset insights)
        if (page === 1 && !search && status === "all") {
          const allLogs = result.data;
          const cnt = allLogs.length;
          if (cnt > 0) {
            const done = allLogs.filter(
              (l: LogData) => l.processingStatus === "done",
            ).length;
            const failed = allLogs.filter(
              (l: LogData) => l.processingStatus === "failed",
            ).length;
            const processing = allLogs.filter(
              (l: LogData) => l.processingStatus === "processing",
            ).length;
            const pending = allLogs.filter(
              (l: LogData) => l.processingStatus === "pending",
            ).length;
            const skipped = allLogs.filter(
              (l: LogData) => l.processingStatus === "skipped",
            ).length;

            let totalDur = 0;
            let durCount = 0;
            allLogs.forEach((log: LogData) => {
              log.processingLogs?.forEach((pl: any) => {
                if (pl.durationMs) {
                  totalDur += pl.durationMs;
                  durCount++;
                }
              });
            });

            setStats({
              total: result.pagination.total,
              done,
              failed,
              processing,
              pending,
              skipped,
              avgDuration: durCount > 0 ? Math.round(totalDur / durCount) : 0,
              successRate:
                result.pagination.total > 0
                  ? (done / result.pagination.total) * 100
                  : 0,
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch logs", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge
            variant="outline"
            className="text-amber-500 border-amber-500/50 bg-amber-500/5 gap-1"
          >
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge
            variant="outline"
            className="text-blue-500 border-blue-500/50 bg-blue-500/5 gap-1"
          >
            <Activity className="h-3 w-3 animate-pulse" />
            Processing
          </Badge>
        );
      case "done":
        return (
          <Badge
            variant="outline"
            className="text-emerald-500 border-emerald-500/50 bg-emerald-500/5 gap-1"
          >
            <CheckCircle2 className="h-3 w-3" />
            Done
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "skipped":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Skipped
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const typeLabels: Record<string, string> = {
    text: "Text",
    voice: "Voice",
    image: "Image",
    document: "Document",
    video: "Video",
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary" />
            System Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor aktivitas pemrosesan pesan dan AI pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard/system/analytics">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
          </a>
          <a href="/dashboard/system/health">
            <Button variant="outline" size="sm" className="gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Health
            </Button>
          </a>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && total > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border bg-gradient-to-br from-emerald-500/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Success Rate
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">
                {stats.successRate.toFixed(0)}%
              </div>
              <div className="flex items-center gap-1 mt-1">
                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${stats.successRate}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-gradient-to-br from-red-500/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Failed
              </CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {stats.failed}
              </div>
              <p className="text-xs text-muted-foreground">
                dari {stats.total} total pesan
              </p>
            </CardContent>
          </Card>

          <Card className="border bg-gradient-to-br from-blue-500/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active / Pending
              </CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">
                {stats.processing + stats.pending}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.processing} processing · {stats.pending} pending
              </p>
            </CardContent>
          </Card>

          <Card className="border bg-gradient-to-br from-violet-500/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avg Latency
              </CardTitle>
              <Zap className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-violet-500">
                {stats.avgDuration > 0
                  ? stats.avgDuration < 1000
                    ? `${stats.avgDuration}ms`
                    : `${(stats.avgDuration / 1000).toFixed(1)}s`
                  : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                rata-rata per step
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Distribution */}
      {!loading && total > 0 && (
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Status Distribution</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {total} total messages
              </span>
            </div>
            <div className="flex h-6 rounded-full bg-muted overflow-hidden">
              {stats.done > 0 && (
                <div
                  className="h-full bg-emerald-500 flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(stats.done / total) * 100}%` }}
                >
                  {((stats.done / total) * 100).toFixed(0)}%
                </div>
              )}
              {stats.failed > 0 && (
                <div
                  className="h-full bg-red-500 flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(stats.failed / total) * 100}%` }}
                >
                  {((stats.failed / total) * 100).toFixed(0)}%
                </div>
              )}
              {stats.processing > 0 && (
                <div
                  className="h-full bg-blue-500"
                  style={{
                    width: `${(stats.processing / total) * 100}%`,
                  }}
                />
              )}
              {stats.skipped > 0 && (
                <div
                  className="h-full bg-gray-400"
                  style={{
                    width: `${(stats.skipped / total) * 100}%`,
                  }}
                />
              )}
              {stats.pending > 0 && (
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${(stats.pending / total) * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Done (
                {stats.done})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500" /> Failed (
                {stats.failed})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-500" /> Processing
                ({stats.processing})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" /> Pending (
                {stats.pending})
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-gray-400" /> Skipped (
                {stats.skipped})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari pesan atau pengirim..."
            className="pl-8 bg-muted/30 border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(val) => {
            setStatus(val ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="pending">⏳ Pending</SelectItem>
            <SelectItem value="processing">🔄 Processing</SelectItem>
            <SelectItem value="done">✅ Done</SelectItem>
            <SelectItem value="failed">❌ Failed</SelectItem>
            <SelectItem value="skipped">⏭️ Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Waktu
              </TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Pengirim
              </TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Pesan / Payload
              </TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-right font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Detail
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-16 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Cpu className="h-10 w-10 opacity-20" />
                    <p className="font-medium">Tidak ada log ditemukan</p>
                    <p className="text-sm">
                      {search
                        ? "Coba ubah filter pencarian"
                        : "Log pemrosesan akan muncul di sini"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground font-mono">
                    <div>{dayjs(log.createdAt).format("DD MMM YYYY")}</div>
                    <div className="text-xs">
                      {dayjs(log.createdAt).format("HH:mm:ss")}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <div className="truncate max-w-[120px]">{log.from}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <MediaThumbnail log={log} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs"
                            title={typeLabels[log.type] || log.type}
                          >
                            {getTypeIcon(log.type)}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground border px-1 py-0.5 rounded bg-muted/50 font-mono leading-none">
                            {log.type}
                          </span>
                        </div>
                        <div className="text-sm truncate max-w-[180px] mt-0.5">
                          {log.body || (
                            <span className="italic text-muted-foreground text-xs">
                              Media / System
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(log.processingStatus)}</TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 hover:bg-primary/5"
                          />
                        }
                      >
                        <Code className="h-4 w-4" />
                        <span className="hidden sm:inline">JSON</span>
                      </DialogTrigger>
                      <DialogContent className="min-w-4xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Terminal className="h-5 w-5 text-primary" />
                            Detail Log Pemrosesan
                          </DialogTitle>
                        </DialogHeader>

                        {/* Tabs for organizing content */}
                        <Tabs defaultValue="steps" className="pt-2">
                          <TabsList
                            variant="line"
                            className="w-full border-b border-border px-2"
                          >
                            <TabsTrigger value="steps" className="gap-1.5">
                              <Activity className="h-3.5 w-3.5" />
                              Steps
                            </TabsTrigger>
                            <TabsTrigger value="raw" className="gap-1.5">
                              <Code className="h-3.5 w-3.5" />
                              Raw Message
                            </TabsTrigger>
                            {log.aiOutputs && log.aiOutputs.length > 0 && (
                              <TabsTrigger value="ai" className="gap-1.5">
                                <Zap className="h-3.5 w-3.5" />
                                AI Output ({log.aiOutputs.length})
                              </TabsTrigger>
                            )}
                            {isPreviewableType(log.type) && (
                              <TabsTrigger value="media" className="gap-1.5">
                                <Eye className="h-3.5 w-3.5" />
                                Media
                              </TabsTrigger>
                            )}
                          </TabsList>

                          {/* Steps tab */}
                          <TabsContent value="steps" className="pt-4">
                            {log.processingLogs &&
                            log.processingLogs.length > 0 ? (
                              <ProcessingTimeline steps={log.processingLogs} />
                            ) : (
                              <div className="py-8 text-center text-muted-foreground text-sm">
                                <Cpu className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>Tidak ada data pemrosesan AI tersedia</p>
                              </div>
                            )}
                          </TabsContent>

                          {/* Raw Message tab */}
                          <TabsContent value="raw" className="pt-4 space-y-4">
                            <JsonBlock
                              label="Pesan Masuk (Raw Payload)"
                              data={log.rawPayload}
                              highlightColor="text-emerald-400"
                            />
                          </TabsContent>

                          {/* AI Outputs tab */}
                          {log.aiOutputs && log.aiOutputs.length > 0 && (
                            <TabsContent value="ai" className="pt-4 space-y-4">
                              {log.aiOutputs.map((ai: any, idx: number) => (
                                <JsonBlock
                                  key={`${ai.provider ?? "unknown"}-${ai.model ?? "N/A"}-${idx}`}
                                  label={`Output AI #${idx + 1} — ${ai.provider ?? "unknown"} / ${ai.model ?? "N/A"}`}
                                  data={{
                                    provider: ai.provider,
                                    model: ai.model,
                                    prompt_preview: ai.prompt?.substring(
                                      0,
                                      200,
                                    ),
                                    response_preview: ai.response?.substring(
                                      0,
                                      500,
                                    ),
                                    parsedOutput: ai.parsedOutput,
                                    latency: `${ai.latencyMs}ms`,
                                    tokens: ai.inputTokens
                                      ? `${ai.inputTokens} → ${ai.outputTokens}`
                                      : "N/A",
                                  }}
                                  highlightColor="text-blue-400"
                                />
                              ))}
                            </TabsContent>
                          )}

                          {/* Media tab */}
                          {isPreviewableType(log.type) && (
                            <TabsContent
                              value="media"
                              className="pt-4 space-y-4"
                            >
                              <MediaPreview log={log} />
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex gap-2">
                                  <span className="font-medium">Type:</span>
                                  <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                    {log.type}
                                  </code>
                                </div>
                                {log.mediaMimetype && (
                                  <div className="flex gap-2">
                                    <span className="font-medium">MIME:</span>
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                      {log.mediaMimetype}
                                    </code>
                                  </div>
                                )}
                                {log.mediaUrl && (
                                  <div className="flex gap-2">
                                    <span className="font-medium">
                                      Original URL:
                                    </span>
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] truncate max-w-[400px]">
                                      {log.mediaUrl}
                                    </code>
                                  </div>
                                )}
                                {log.storagePath && (
                                  <div className="flex gap-2">
                                    <span className="font-medium">
                                      Storage:
                                    </span>
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                      {log.storagePath}
                                    </code>
                                  </div>
                                )}
                              </div>
                            </TabsContent>
                          )}

                          {/* Fallback: no content at all */}
                          {(!log.aiOutputs || log.aiOutputs.length === 0) &&
                            (!log.processingLogs ||
                              log.processingLogs.length === 0) && (
                              <div className="py-8 text-center text-muted-foreground text-sm">
                                <Cpu className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>Tidak ada data pemrosesan AI tersedia</p>
                              </div>
                            )}
                        </Tabs>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages} · {total} log
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev || loading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || loading}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
