"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RefreshCw,
  ServerCrash,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Error:", error);
  }, [error]);

  const isNetworkError =
    error.message?.includes("fetch") ||
    error.message?.includes("network") ||
    error.message?.includes("ECONNREFUSED");

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-10%] left-[-10%] h-[400px] w-[400px] rounded-full bg-amber-500/8 blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[300px] w-[300px] rounded-full bg-red-500/5 blur-[80px]" />

      <div className="z-10 w-full max-w-lg px-4 text-center">
        {/* Error Icon */}
        <div className="mb-6 inline-flex">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10 backdrop-blur-sm">
              {isNetworkError ? (
                <WifiOff className="h-10 w-10 text-destructive" />
              ) : (
                <ServerCrash className="h-10 w-10 text-destructive" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-destructive">
              <AlertTriangle className="h-4 w-4 text-destructive-foreground" />
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          {isNetworkError ? "Gangguan Koneksi" : "Terjadi Kesalahan"}
        </h1>
        <p className="mb-2 text-sm text-muted-foreground leading-relaxed">
          {isNetworkError
            ? "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."
            : "Maaf, terjadi kesalahan yang tidak terduga saat memuat halaman ini."}
        </p>

        {/* Error digest for debugging */}
        {error.digest && (
          <Card className="mb-6 mx-auto max-w-xs border border-destructive/20 bg-destructive/5">
            <CardContent className="p-3">
              <p className="text-[11px] font-mono text-muted-foreground break-all">
                ID: {error.digest}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
          <Button onClick={reset} className="gap-2 shadow-lg shadow-primary/20">
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" className="gap-2">
              <Home className="h-4 w-4" />
              Kembali ke Dashboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sebelumnya
          </Button>
        </div>

        {/* Helpful links */}
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground mb-3">
            Jika masalah berlanjut, coba:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <Link
              href="/dashboard/transactions"
              className="rounded-lg border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              Transaksi
            </Link>
            <Link
              href="/dashboard/budgets"
              className="rounded-lg border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              Budget
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-lg border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              Pengaturan
            </Link>
            <Link
              href="/api/auth/logout"
              className="rounded-lg border px-2.5 py-1.5 text-destructive/70 hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Logout & Masuk Ulang
            </Link>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground/50">
          FinCore Dashboard · Error Boundary
        </p>
      </div>
    </div>
  );
}
