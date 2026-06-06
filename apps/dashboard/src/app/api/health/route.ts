import { getIsOwner } from "@/lib/auth";
import getConfig from "@fincore/config";
import { getDb } from "@fincore/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Simple TCP socket check for Valkey/Redis health without adding
 * ioredis (or @fincore/queue) as a dashboard dependency.
 */
function checkValkeyTcp(): Promise<boolean> {
  const valkeyUrl =
    (getConfig("VALKEY_URL") as string) ?? "redis://localhost:6379";
  let host = "localhost";
  let port = 6379;

  try {
    const u = new URL(valkeyUrl);
    host = u.hostname;
    if (u.port) port = parseInt(u.port, 10);
  } catch {
    // fallback defaults
  }

  return new Promise((resolve) => {
    const net = require("net") as typeof import("net");
    const socket = new net.Socket();
    const timeout = 3000;

    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function GET() {
  const isOwner = await getIsOwner();
  if (!isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks: Record<string, { status: string; detail?: string }> = {};

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "healthy" };
  } catch (err) {
    checks.database = {
      status: "unhealthy",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }

  try {
    const reachable = await checkValkeyTcp();
    checks.valkey = {
      status: reachable ? "healthy" : "unhealthy",
      detail: reachable
        ? "TCP port reachable"
        : "Connection refused or timed out",
    };
  } catch (err) {
    checks.valkey = {
      status: "unhealthy",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    },
    { status: allHealthy ? 200 : 503 },
  );
}
