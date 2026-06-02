import getConfig from "@fincore/config";
import { getDb, sessions } from "@fincore/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token tidak ditemukan" },
      { status: 400 },
    );
  }

  // Mengembalikan HTML sederhana yang akan melakukan POST otomatis
  // Ini menghindari masalah CSRF, prefetching, dan WhatsApp link-preview bot!
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<title>Memverifikasi — FinCore</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: oklch(0.987 0.003 253);
    --fg: oklch(0.147 0.016 265);
    --card: oklch(1 0 0);
    --card-fg: oklch(0.147 0.016 265);
    --primary: oklch(0.52 0.26 277);
    --primary-fg: oklch(0.985 0 0);
    --muted: oklch(0.955 0.012 255);
    --muted-fg: oklch(0.54 0.02 255);
    --border: oklch(0.89 0.012 255);
    --emerald: oklch(0.66 0.16 156);
    --radius: 0.75rem;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: oklch(0.128 0.02 270);
      --fg: oklch(0.96 0.005 260);
      --card: oklch(0.16 0.02 272);
      --card-fg: oklch(0.96 0.005 260);
      --primary: oklch(0.65 0.26 277);
      --primary-fg: oklch(0.985 0 0);
      --muted: oklch(0.2 0.025 268);
      --muted-fg: oklch(0.68 0.025 268);
      --border: oklch(1 0 0 / 10%);
      --emerald: oklch(0.72 0.18 152);
    }
  }

  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background 0.3s ease, color 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  /* Background grid (matches login page) */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(oklch(0.52 0.26 277 / 0.025) 1px, transparent 1px),
      linear-gradient(90deg, oklch(0.52 0.26 277 / 0.025) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, #000 70%, transparent 110%);
    -webkit-mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, #000 70%, transparent 110%);
    pointer-events: none;
  }

  /* Glow orbs */
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    pointer-events: none;
    animation: orbFadeIn 1s ease-out both;
  }
  .orb--top-left {
    top: -10%;
    left: -10%;
    width: 500px;
    height: 500px;
    background: var(--primary);
    opacity: 0.12;
    animation-delay: 0s;
  }
  .orb--bottom-right {
    bottom: -10%;
    right: -10%;
    width: 600px;
    height: 600px;
    background: oklch(0.55 0.19 250 / 30%);
    opacity: 0.08;
    animation-delay: 0.3s;
  }
  .orb--center {
    top: 40%;
    left: 60%;
    width: 300px;
    height: 300px;
    background: oklch(0.55 0.24 280 / 40%);
    opacity: 0.06;
    animation-delay: 0.5s;
  }

  @keyframes orbFadeIn {
    from { opacity: 0; transform: scale(0.8); }
    to   { opacity: var(--orb-opacity, 0.1); transform: scale(1); }
  }

  /* Card — glass morphism */
  .card {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 28rem;
    margin: 1.5rem;
    padding: 2.5rem 2rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: oklch(from var(--card) l c h / 0.75);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 25px 50px -12px oklch(0 0 0 / 8%);
    text-align: center;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  /* Logo */
  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    margin-bottom: 1.5rem;
  }
  .logo svg { width: 1.5rem; height: 1.5rem; }
  .logo span {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--emerald);
  }

  /* Spinner */
  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 1.25rem;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Typography */
  h2 {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }
  p {
    font-size: 0.875rem;
    color: var(--muted-fg);
    line-height: 1.5;
    margin-bottom: 1.5rem;
  }

  /* Button (for noscript fallback) */
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1.5rem;
    background: var(--primary);
    color: var(--primary-fg);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 600;
    font-family: inherit;
    transition: opacity 0.2s;
  }
  button:hover { opacity: 0.9; }
  button:active { transform: scale(0.98); }

  /* Noscript fallback */
  noscript p { margin-bottom: 1rem; }

  /* Secure notice */
  .secure-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 1.25rem;
    font-size: 0.75rem;
    color: var(--muted-fg);
    opacity: 0.7;
  }
  .secure-badge svg { width: 0.875rem; height: 0.875rem; }
</style>
</head>
<body onload="document.getElementById('verify-form').submit()">

<div class="orb orb--top-left" style="--orb-opacity:0.12"></div>
<div class="orb orb--bottom-right" style="--orb-opacity:0.08"></div>
<div class="orb orb--center" style="--orb-opacity:0.06"></div>

<div class="card">
  <!-- FinCore Logo -->
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="var(--emerald)">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
    <span>FinCore</span>
  </div>

  <div class="spinner" id="spinner"></div>

  <h2>Memverifikasi Akses</h2>
  <p>Mohon tunggu sebentar, kami sedang memverifikasi link akses kamu.</p>

  <form id="verify-form" method="POST" action="/api/auth/verify">
    <input type="hidden" name="token" value="${token}" />

    <noscript>
      <style>#spinner { display: none; } h2 { margin-top: 0; }</style>
      <p>JavaScript tidak aktif. Silakan klik tombol di bawah untuk masuk.</p>
      <button type="submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        Masuk ke Dashboard
      </button>
    </noscript>
  </form>

  <!-- Secure badge -->
  <div class="secure-badge">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span>Verifikasi Aman · FinCore</span>
  </div>
</div>

</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function POST(request: NextRequest) {
  let token: string | null = null;

  // Ambil token dari FormData
  const formData = await request.formData().catch(() => null);
  if (formData) {
    token = formData.get("token") as string;
  }

  if (!token) {
    return NextResponse.json(
      { error: "Token tidak ditemukan" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Hash the token since it's stored hashed in the DB
  const crypto = await import("crypto");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Cari session yang cocok dengan magic token ini
  const sessionRecord = await db.query.sessions.findFirst({
    where: eq(sessions.magicToken, hashedToken),
  });

  if (!sessionRecord) {
    return NextResponse.json(
      { error: "Token tidak valid atau sudah kadaluarsa" },
      { status: 401 },
    );
  }

  // Cek apakah token sudah expired
  if (
    !sessionRecord.magicTokenExpiresAt ||
    new Date() > sessionRecord.magicTokenExpiresAt
  ) {
    return NextResponse.json(
      { error: "Token sudah kadaluarsa. Silakan minta link baru di WhatsApp." },
      { status: 401 },
    );
  }

  // Update session
  await db
    .update(sessions)
    .set({
      // Perpanjang sesi 7 hari
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .where(eq(sessions.id, sessionRecord.id));

  // Set HTTP-Only Cookie
  const cookieStore = await cookies();
  cookieStore.set("fincore_session", sessionRecord.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
  });

  // Redirect ke dashboard
  const dashboardUrl = getConfig("DASHBOARD_URL");
  return NextResponse.redirect(`${dashboardUrl}/dashboard`, 303);
}
