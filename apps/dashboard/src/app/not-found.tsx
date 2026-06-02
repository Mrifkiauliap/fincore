"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass, FileSearch, Home, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_REDIRECT_SECONDS = 10;

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
    label: "Laporan",
    href: "/dashboard/insights",
    icon: Compass,
    desc: "Insight & analisis",
  },
];

export default function NotFoundPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const redirectToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          redirectToDashboard();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [redirectToDashboard]);

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px]" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px]" />

      <div className="relative z-10 max-w-lg w-full text-center">
        {/* 404 display */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03]">
            <span className="text-[140px] font-black">404</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-3">Halaman Tidak Ditemukan</h1>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
          Halaman yang kamu cari tidak tersedia atau mungkin telah dipindahkan.
        </p>

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium shadow-lg"
          >
            <Home className="h-4 w-4" />
            Kembali ke Dashboard
          </Link>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali Sebelumnya
          </Button>
        </div>

        {/* Auto-redirect notice */}
        <p className="text-xs text-muted-foreground mb-6">
          Mengarahkan ke dashboard dalam{" "}
          <span className="font-semibold">{countdown}</span> detik...
        </p>

        {/* Suggested links */}
        <div className="text-left">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Mungkin kamu mencari:
          </p>
          <div className="grid gap-2">
            {suggestedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <link.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
