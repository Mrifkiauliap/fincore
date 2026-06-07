import { logger } from "@/lib/logger";
import { getDb, rawMessages } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/logs/retry
 *
 * Body: { rawMessageId: string }
 *
 * Resets a failed or pending_confirmation message back to "processing"
 * and re-enqueues the appropriate job (OCR or voice transcription).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rawMessageId } = body as { rawMessageId: string };

    if (!rawMessageId) {
      return NextResponse.json(
        { error: "rawMessageId is required" },
        { status: 400 },
      );
    }

    const db = getDb();

    const [msg] = await db
      .select()
      .from(rawMessages)
      .where(eq(rawMessages.id, rawMessageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (
      msg.processingStatus !== "failed" &&
      msg.processingStatus !== "pending_confirmation"
    ) {
      return NextResponse.json(
        {
          error: "Only failed or pending_confirmation messages can be retried",
          currentStatus: msg.processingStatus,
        },
        { status: 400 },
      );
    }

    let targetQueue: string;
    let targetJob: string;
    let jobData: Record<string, unknown>;

    if (msg.type === MessageType.VOICE) {
      targetQueue = QueueName.VOICE_TRANSCRIPTION;
      targetJob = JobName.TRANSCRIBE_VOICE;
      jobData = {
        rawMessageId: msg.id,
        userId: msg.userId,
        from: msg.from,
        mediaUrl: msg.mediaUrl,
        mediaMimetype: msg.mediaMimetype ?? "audio/ogg; codecs=opus",
        caption: msg.body ?? null,
      };
    } else if (
      msg.type === MessageType.IMAGE ||
      msg.type === MessageType.DOCUMENT
    ) {
      targetQueue = QueueName.IMAGE_OCR;
      targetJob = JobName.OCR_IMAGE;
      jobData = {
        rawMessageId: msg.id,
        userId: msg.userId,
        from: msg.from,
        mediaUrl: msg.mediaUrl,
        mediaMimetype:
          msg.mediaMimetype ??
          (msg.mediaUrl?.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "image/jpeg"),
        caption: msg.body ?? null,
      };
    } else {
      return NextResponse.json(
        {
          error: `Cannot retry message type: ${msg.type}. Only voice, image, and document messages are supported.`,
        },
        { status: 400 },
      );
    }

    await db
      .update(rawMessages)
      .set({
        processingStatus: "processing",
        processingError: null,
        processedAt: null,
      })
      .where(eq(rawMessages.id, rawMessageId));

    await enqueue(targetQueue, targetJob, jobData);

    logger.info(
      { rawMessageId, type: msg.type, targetQueue },
      "Message re-queued for processing",
    );

    return NextResponse.json({
      success: true,
      rawMessageId,
      processingStatus: "processing",
      message: `Message re-queued to ${targetQueue}`,
    });
  } catch (error: any) {
    logger.error({ err: String(error) }, "POST /api/logs/retry failed");
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
