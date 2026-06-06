import { getIsOwner } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { analyticsEvents, getDb } from "@fincore/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const isOwner = await getIsOwner();
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getDb();
    const { searchParams } = request.nextUrl;

    const days = parseInt(searchParams.get("days") || "30");
    const metric = searchParams.get("metric") || "overview";
    const since = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`;

    switch (metric) {
      case "daily": {
        const daily = await db
          .select({
            day: sql<string>`DATE(created_at)`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(analyticsEvents)
          .where(sql`created_at >= ${since}`)
          .groupBy(sql`DATE(created_at)`)
          .orderBy(sql`DATE(created_at)`);

        return NextResponse.json({ metric: "daily", data: daily });
      }

      case "ai": {
        const [aiStats] = await db
          .select({
            totalExtractions: sql<number>`COUNT(*) FILTER (WHERE event = 'ai.extraction.completed')::int`,
            totalFailures: sql<number>`COUNT(*) FILTER (WHERE event = 'ai.extraction.failed')::int`,
            avgLatencyMs: sql<number>`COALESCE(ROUND(AVG((metadata->>'latencyMs')::numeric) FILTER (WHERE event = 'ai.extraction.completed')), 0)`,
            avgTokens: sql<number>`COALESCE(ROUND(AVG((metadata->>'totalTokens')::numeric) FILTER (WHERE event = 'ai.extraction.completed')), 0)`,
            totalCost: sql<number>`COALESCE(SUM((metadata->>'cost')::numeric) FILTER (WHERE event = 'ai.extraction.completed'), 0)`,
            mostUsedModel: sql<string>`COALESCE(MODE() WITHIN GROUP (ORDER BY metadata->>'model') FILTER (WHERE event = 'ai.extraction.completed'), 'N/A')`,
          })
          .from(analyticsEvents)
          .where(sql`category = 'ai' AND created_at >= ${since}`);

        const dailyAi = await db
          .select({
            day: sql<string>`DATE(created_at)`,
            completed: sql<number>`COUNT(*) FILTER (WHERE event = 'ai.extraction.completed')::int`,
            failed: sql<number>`COUNT(*) FILTER (WHERE event = 'ai.extraction.failed')::int`,
          })
          .from(analyticsEvents)
          .where(sql`category = 'ai' AND created_at >= ${since}`)
          .groupBy(sql`DATE(created_at)`)
          .orderBy(sql`DATE(created_at)`);

        return NextResponse.json({
          metric: "ai",
          summary: aiStats || {
            totalExtractions: 0,
            totalFailures: 0,
            avgLatencyMs: 0,
            avgTokens: 0,
            totalCost: 0,
            mostUsedModel: "N/A",
          },
          daily: dailyAi,
        });
      }

      case "users": {
        const [userStats] = await db
          .select({
            totalOnboarded: sql<number>`COUNT(*) FILTER (WHERE event = 'user.onboarded')::int`,
            totalLogins: sql<number>`COUNT(*) FILTER (WHERE event = 'user.login')::int`,
            uniqueUsers: sql<number>`COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int`,
          })
          .from(analyticsEvents)
          .where(sql`category = 'user' AND created_at >= ${since}`);

        // Daily active users
        const dailyUsers = await db
          .select({
            day: sql<string>`DATE(created_at)`,
            uniqueUsers: sql<number>`COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int`,
          })
          .from(analyticsEvents)
          .where(sql`created_at >= ${since} AND user_id IS NOT NULL`)
          .groupBy(sql`DATE(created_at)`)
          .orderBy(sql`DATE(created_at)`);

        return NextResponse.json({
          metric: "users",
          summary: userStats || {
            totalOnboarded: 0,
            totalLogins: 0,
            uniqueUsers: 0,
          },
          daily: dailyUsers,
        });
      }

      case "overview":
      default: {
        // Counts per category
        const byCategory = await db
          .select({
            category: analyticsEvents.category,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(analyticsEvents)
          .where(sql`created_at >= ${since}`)
          .groupBy(analyticsEvents.category);

        // Counts per event type
        const byEvent = await db
          .select({
            event: analyticsEvents.event,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(analyticsEvents)
          .where(sql`created_at >= ${since}`)
          .groupBy(analyticsEvents.event)
          .orderBy(sql`COUNT(*) DESC`)
          .limit(20);

        // Total events
        const [totals] = await db
          .select({
            total: sql<number>`COUNT(*)::int`,
            latestEvent: sql<string>`MAX(created_at)::text`,
          })
          .from(analyticsEvents);

        return NextResponse.json({
          metric: "overview",
          days,
          totals: totals || { total: 0, latestEvent: null },
          byCategory: byCategory,
          byEvent: byEvent,
        });
      }
    }
  } catch (error) {
    logger.error(
      { route: "GET /api/analytics", err: String(error) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal mengambil data analytics" },
      { status: 500 },
    );
  }
}
