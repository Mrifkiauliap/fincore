import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const session = request.cookies.get("fincore_session");

  // Lindungi rute /dashboard
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!session) {
      // Redirect ke login jika belum ada sesi
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Jika sudah login, jangan boleh buka halaman /login lagi (redirect ke dashboard)
  if (request.nextUrl.pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
