import { getCurrentUser } from "@/lib/auth";
import {
  aiProcessingLogs,
  getDb,
  rawAiOutputs,
  rawMessages,
} from "@fincore/db";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "15");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const conditions = [eq(rawMessages.userId, user.id)];

    if (status && status !== "all") {
      conditions.push(eq(rawMessages.processingStatus, status as any));
    }

    if (search) {
      conditions.push(
        or(
          ilike(rawMessages.body, `%${search}%`),
          ilike(rawMessages.from, `%${search}%`),
        ) as any,
      );
    }

    const whereClause = and(...conditions);

    const offset = (page - 1) * limit;

    const [totalResult] = await db
      .select({ count: count() })
      .from(rawMessages)
      .where(whereClause);

    const total = totalResult?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Fetch raw messages with explicit ordering (no relational "with")
    const rows = await db
      .select()
      .from(rawMessages)
      .where(whereClause)
      .orderBy(desc(rawMessages.createdAt))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    }

    // Collect all message IDs for batch fetching related data
    const messageIds = rows.map((r) => r.id);

    // Fetch all aiOutputs for these messages in one query
    const allOutputs = await db
      .select()
      .from(rawAiOutputs)
      .where(eq(rawAiOutputs.rawMessageId, messageIds[0]));

    // Extend query for multiple IDs using IN clause
    const allOutputsMulti =
      messageIds.length > 1
        ? await db
            .select()
            .from(rawAiOutputs)
            .where(
              or(...messageIds.map((id) => eq(rawAiOutputs.rawMessageId, id))),
            )
            .orderBy(desc(rawAiOutputs.createdAt))
        : allOutputs;

    // Fetch all processingLogs for these messages in one query
    const allLogs =
      messageIds.length > 1
        ? await db
            .select()
            .from(aiProcessingLogs)
            .where(
              or(
                ...messageIds.map((id) =>
                  eq(aiProcessingLogs.rawMessageId, id),
                ),
              ),
            )
            .orderBy(asc(aiProcessingLogs.createdAt))
        : await db
            .select()
            .from(aiProcessingLogs)
            .where(eq(aiProcessingLogs.rawMessageId, messageIds[0]))
            .orderBy(asc(aiProcessingLogs.createdAt));

    // Group related data by message ID
    const outputsByMessage = new Map<string, typeof allOutputsMulti>();
    for (const o of allOutputsMulti) {
      const existing = outputsByMessage.get(o.rawMessageId) ?? [];
      if (existing.length < 5) {
        existing.push(o);
        outputsByMessage.set(o.rawMessageId, existing);
      }
    }

    const logsByMessage = new Map<string, typeof allLogs>();
    for (const l of allLogs) {
      const existing = logsByMessage.get(l.rawMessageId) ?? [];
      existing.push(l);
      logsByMessage.set(l.rawMessageId, existing);
    }

    // Merge into final shape matching the old relational output
    const data = rows.map((row) => ({
      ...row,
      aiOutputs: outputsByMessage.get(row.id) ?? [],
      processingLogs: logsByMessage.get(row.id) ?? [],
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("GET /api/logs error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil data log" },
      { status: 500 },
    );
  }
}
