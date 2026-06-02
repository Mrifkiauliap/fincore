"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function LogoutPage() {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    fetch("/api/auth/logout", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.redirect) {
          window.location.href = data.redirect;
        } else {
          router.push("/login");
        }
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Keluar...</p>
      </div>
    </div>
  );
}
