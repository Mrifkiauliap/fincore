import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import getConfig from "@fincore/config";
import {
  BarChart3,
  BrainCircuit,
  Clock,
  MessageCircle,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";

const featureHighlights = [
  {
    icon: BrainCircuit,
    title: "AI-Powered",
    desc: "Ekstraksi transaksi otomatis dengan AI",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: BarChart3,
    title: "Insight Cerdas",
    desc: "Analisis pola keuangan kamu",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Clock,
    title: "Real-time",
    desc: "Proses transaksi via WhatsApp instan",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: PiggyBank,
    title: "Budget",
    desc: "Pantau anggaran & tagihan berkala",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
];

export default function LoginPage() {
  const waBotNumber = getConfig("WAHA_BOT_NUMBER") ?? "";
  const prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(var(--primary)/0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--primary)/0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      {/* Background Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[100px] animate-in fade-in duration-1000" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[120px] animate-in fade-in duration-1000 delay-300" />
      <div className="absolute top-[40%] left-[60%] h-[300px] w-[300px] rounded-full bg-violet-500/8 blur-[80px] animate-in fade-in duration-1000 delay-500" />

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="z-10 w-full max-w-2xl px-4 py-12">
        <div className="group relative rounded-3xl border border-white/10 bg-card/60 p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:border-primary/30 hover:shadow-primary/5">
          {/* Top Decorative Logo */}
          <div className="absolute -top-14 left-1/2 -translate-x-1/2">
            <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl border border-primary/20 bg-card/80 shadow-lg backdrop-blur-md transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <Sparkles className="absolute top-3 right-3 h-5 w-5 text-primary animate-pulse" />
              <div className="flex items-center gap-0.5">
                <TrendingUp className="h-12 w-12 text-emerald-500 drop-shadow-md" />
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center text-center">
            {/* Brand Name */}
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-bold tracking-widest uppercase text-emerald-500">
                FinCore
              </span>
            </div>

            <h1 className="mb-3 text-3xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
              Selamat Datang
            </h1>
            <p className="mb-6 text-sm text-muted-foreground max-w-[320px] leading-relaxed">
              Platform manajemen keuangan cerdas dengan akses instan tanpa
              password — cukup WhatsApp.
            </p>

            {/* Feature Highlights */}
            <div className="mb-8 grid grid-cols-2 gap-2 w-full">
              {featureHighlights.map((feat) => (
                <div
                  key={feat.title}
                  className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/20 p-3 text-left backdrop-blur-sm hover:bg-muted/30 transition-colors"
                >
                  <div className={`shrink-0 rounded-lg p-1.5 ${feat.bg}`}>
                    <feat.icon className={`h-4 w-4 ${feat.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{feat.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Instruction Card */}
            <div className="mb-6 w-full rounded-2xl border border-border/50 bg-muted/30 p-5 text-left backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2 font-semibold text-sm">
                <Zap className="h-4 w-4 text-amber-500" />
                Cara Masuk Cepat:
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                    1
                  </span>
                  <span>
                    Klik tombol{" "}
                    <strong className="text-foreground font-medium">
                      Buka WhatsApp Bot
                    </strong>{" "}
                    di bawah.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                    2
                  </span>
                  <span>
                    Kirim pesan{" "}
                    <code className="rounded bg-background px-1.5 py-0.5 text-primary border font-mono text-xs">
                      {prefix}dashboard
                    </code>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                    3
                  </span>
                  <span>
                    Klik <strong>Magic Link</strong> yang dibalas oleh bot untuk
                    masuk otomatis.
                  </span>
                </li>
              </ol>
            </div>

            {/* CTA Button */}
            {waBotNumber ? (
              <Button
                className="group relative w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40 hover:-translate-y-1 overflow-hidden"
                size="lg"
                nativeButton={false}
                render={
                  <Link
                    href={`https://wa.me/${waBotNumber}?text=${prefix}dashboard`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <span className="absolute inset-0 bg-gradient-to-r from-primary via-violet-500 to-primary bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />
                <span className="relative z-10 flex items-center">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Buka WhatsApp Bot
                  <ChevronRightIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            ) : (
              <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm text-amber-600 dark:text-amber-400 backdrop-blur-sm">
                ⚠️ Bot WhatsApp belum dikonfigurasi. Setel{" "}
                <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
                  WAHA_BOT_NUMBER
                </code>{" "}
                di environment.
              </div>
            )}

            {/* Security Badge */}
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground/80">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Aman dengan validasi Magic Link OTP</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground/50">
          FinCore Dashboard v0.1.0 ·{" "}
          <span className="text-emerald-500/60">No Password Needed</span>
        </p>
      </div>
    </div>
  );
}

function ChevronRightIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
