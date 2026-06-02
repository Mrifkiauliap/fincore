import getConfig from "@fincore/config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const session = request.cookies.get("fincore_session");
  const dashboardUrl = getConfig("DASHBOARD_URL");

  // Create base response
  let response = NextResponse.next();

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isLoginRoute = request.nextUrl.pathname === "/login";

  if (isDashboardRoute && !session) {
    return NextResponse.redirect(`${dashboardUrl}/login`);
  }

  if (isLoginRoute && session) {
    response = NextResponse.redirect(`${dashboardUrl}/dashboard`);
  }

  // Sliding Session: Perpanjang cookie 7 hari tiap request
  if (session) {
    response.cookies.set({
      name: "fincore_session",
      value: session.value,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
    });
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
