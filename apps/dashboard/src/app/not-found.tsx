"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass, FileSearch, Home, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function NotFoundPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/dashboard");
      return;
    }
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, router]);

  const suggestedLinks = [
    {
      label: "Overview",
      href: "/dashboard",
      icon: Home,
      desc: "Dashboard utama",
    },
    {
      label: "Transaksi",
      href: "/dashboard/transactions",
      icon: FileSearch,
      desc: "Lihat & kelola transaksi",
    },
    {
      label: "AI Insights",
      href: "/dashboard/insights",
      icon: Compass,
      desc: "Analisis cerdas keuangan",
    },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-10%] h-[600px] w-[600px] rounded-full bg-violet-500/10 blur-[120px] animate-in fade-in duration-1000" />
      <div className="absolute bottom-[-15%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/8 blur-[100px] animate-in fade-in duration-1000 delay-300" />

      <div className="z-10 w-full max-w-xl px-4 text-center">
        {/* 404 Graphic */}
        <div className="relative mb-8 inline-block">
          <div className="relative select-none">
            <span className="text-[140px] font-black leading-none tracking-tighter text-primary/10">
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[140px] font-black leading-none tracking-tighter bg-gradient-to-b from-foreground via-foreground/40 to-transparent bg-clip-text text-transparent">
                404
              </span>
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Ups! Halaman hilang 🧭
        </h1>
        <p className="mb-8 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Sepertinya halaman yang kamu cari sudah dipindahkan, dihapus, atau
          tidak pernah ada.
        </p>

        {/* Auto-redirect bar */}
        <div className="mb-8 mx-auto max-w-sm">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <ArrowLeft className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <div className="text-left flex-1">
              <p className="font-medium text-xs">Auto-redirect</p>
              <p className="text-xs text-muted-foreground">
                Kembali ke dashboard dalam{" "}
                <span className="font-bold text-primary tabular-nums">
                  {countdown}
                </span>{" "}
                detik
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-primary transition-all duration-1000 ease-linear"
              style={{ width: `${((10 - countdown) / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link href="/dashboard">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
              <Home className="h-4 w-4" />
              Kembali ke Dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali Sebelumnya
          </Button>
        </div>

        {/* Suggested Links */}
        <div className="border-t pt-8">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-2">
            <Search className="h-3.5 w-3.5" />
            Mungkin kamu mencari:
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {suggestedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col items-center gap-1.5 rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:border-primary/30 hover:shadow-sm hover:-translate-y-0.5 backdrop-blur-sm"
              >
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <link.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {link.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {link.desc}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-[11px] text-muted-foreground/60">
          FinCore Dashboard · Status {countdown > 0 ? "404" : "Redirecting..."}
        </p>
      </div>
    </div>
  );
}
