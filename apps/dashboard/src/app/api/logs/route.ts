import { logger } from "@/lib/logger";
import {
  aiProcessingLogs,
  getDb,
  rawAiOutputs,
  rawMessages,
} from "@fincore/db";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/logs
 *
 * Query params:
 *   page   — default 1
 *   limit  — default 15, max 50
 *   search — search in body, from, type
 *   status — filter by processingStatus (pending|processing|done|failed|skipped)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") ?? "15", 10)),
    );
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";

    const db = getDb();
    const offset = (page - 1) * limit;

    // ── Build WHERE clause ──────────────────────────────────────────────
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(rawMessages.body, `%${search}%`),
          ilike(rawMessages.from, `%${search}%`),
          ilike(rawMessages.type, `%${search}%`),
        )!,
      );
    }

    if (status && status !== "all") {
      conditions.push(eq(rawMessages.processingStatus, status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // ── Query with count ────────────────────────────────────────────────
    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(rawMessages)
        .where(whereClause)
        .orderBy(desc(rawMessages.receivedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(rawMessages)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // ── Fetch related processing logs & AI outputs ──────────────────────
    const logIds = logs.map((l) => l.id);

    const [processingLogs, aiOutputs] = await Promise.all([
      logIds.length > 0
        ? db
            .select()
            .from(aiProcessingLogs)
            .where(inArray(aiProcessingLogs.rawMessageId, logIds))
            .orderBy(sql`${aiProcessingLogs.createdAt} ASC`)
        : Promise.resolve([]),
      logIds.length > 0
        ? db
            .select()
            .from(rawAiOutputs)
            .where(inArray(rawAiOutputs.rawMessageId, logIds))
            .orderBy(sql`${rawAiOutputs.createdAt} ASC`)
        : Promise.resolve([]),
    ]);

    // ── Merge into response ─────────────────────────────────────────────
    const data = logs.map((log) => ({
      id: log.id,
      waMessageId: log.waMessageId,
      from: log.from,
      type: log.type,
      body: log.body,
      processingStatus: log.processingStatus,
      processingError: log.processingError,
      createdAt: log.receivedAt,
      rawPayload: log.rawPayload,
      mediaUrl: log.mediaUrl,
      mediaMimetype: log.mediaMimetype,
      storagePath: log.storagePath,
      processingLogs: processingLogs.filter((pl) => pl.rawMessageId === log.id),
      aiOutputs: aiOutputs.filter((ao) => ao.rawMessageId === log.id),
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
  } catch (error: any) {
    logger.error({ err: String(error) }, "GET /api/logs failed");
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
