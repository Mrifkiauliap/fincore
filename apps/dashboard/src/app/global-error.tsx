"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {/* Theme toggle */}
        <div className="absolute top-4 right-4 z-50">
          <ThemeToggle />
        </div>

        <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/30" />
          <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-destructive/8 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[400px] w-[400px] rounded-full bg-amber-500/5 blur-[100px]" />

          <div className="z-10 w-full max-w-lg px-4 text-center">
            {/* Icon */}
            <div className="mb-6 inline-flex">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-destructive/10 backdrop-blur-sm border border-destructive/20">
                <WifiOff className="h-12 w-12 text-destructive/70" />
              </div>
            </div>

            {/* Title */}
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight">
              Aplikasi Mengalami Gangguan
            </h1>
            <p className="mb-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Terjadi kesalahan kritis yang mencegah aplikasi dimuat. Tim teknis
              akan segera menanganinya.
            </p>

            {/* Error ID */}
            {error.digest && (
              <div className="mb-8 mx-auto max-w-xs">
                <p className="text-[11px] font-mono text-muted-foreground/60 break-all bg-muted/30 rounded-lg px-3 py-2 border">
                  Error ID: {error.digest}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
              <Button
                onClick={reset}
                size="lg"
                className="gap-2 shadow-lg shadow-primary/20"
              >
                <RefreshCw className="h-4 w-4" />
                Muat Ulang Aplikasi
              </Button>
              <Link href="/dashboard">
                <Button variant="outline" size="lg" className="gap-2">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            </div>

            {/* Help */}
            <div className="border-t border-border/40 pt-6 max-w-sm mx-auto">
              <div className="flex items-start gap-3 text-left text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <p>
                  Jika masalah berlanjut setelah memuat ulang, coba bersihkan
                  cache browser, logout lalu login kembali, atau hubungi
                  administrator sistem.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  href="/logout"
                  className="text-xs text-destructive hover:underline"
                >
                  Logout & Masuk Ulang →
                </Link>
              </div>
            </div>

            <p className="mt-8 text-[11px] text-muted-foreground/40">
              FinCore Dashboard · Critical Error
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
