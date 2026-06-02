import { getCurrentUserId } from "@/lib/auth";
import { decodeMediaPath } from "@/lib/media-url";
import getConfig from "@fincore/config";
import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

/**
 * GET /api/media?p=<base64url-encoded-storagePath>
 *
 * Serves media files stored locally via the StorageProvider.
 * Requires valid fincore_session cookie (authenticated dashboard user).
 * The `p` parameter is base64url-encoded storagePath (e.g. local://uploads/image/uuid.jpg).
 *
 * Security:
 * - Session cookie required → only logged-in dashboard users
 * - base64url obfuscation → prevents casual URL guessing
 * - Path traversal protection → only serves from LOCAL_UPLOAD_DIR
 * - MIME type whitelist → only serves image/audio/video/pdf
 */
export async function GET(request: NextRequest) {
  // 1. Auth check
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Decode path parameter
  const encoded = request.nextUrl.searchParams.get("p");
  const storagePath = decodeMediaPath(encoded);
  if (!storagePath) {
    return NextResponse.json(
      { error: "Invalid or missing media path" },
      { status: 400 },
    );
  }

  // 3. Resolve to filesystem path
  const localUploadDir =
    getConfig("LOCAL_UPLOAD_DIR") ?? resolve(process.cwd(), "../../uploads");

  // storagePath format: "local://uploads/image/uuid.jpg"
  const relativePath = storagePath.replace("local://uploads/", "");
  const absolutePath = join(localUploadDir, relativePath);

  // 4. Path traversal protection: ensure resolved path is within upload dir
  const resolvedDir = resolve(localUploadDir);
  if (!resolve(absolutePath).startsWith(resolvedDir)) {
    return NextResponse.json(
      { error: "Path traversal detected" },
      { status: 403 },
    );
  }

  // 5. Check file exists and get stats
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (!fileStat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 404 });
  }

  // 6. Determine Content-Type from extension (whitelist)
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";

  const contentType = MIME_MAP[ext];
  if (!contentType) {
    return NextResponse.json(
      { error: "Unsupported media type" },
      { status: 415 },
    );
  }

  // 7. Stream the file
  const stream = createReadStream(absolutePath);

  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileStat.size.toString(),
      "Cache-Control": "private, max-age=3600",
      // Prevent download by setting inline disposition
      "Content-Disposition": "inline",
    },
  });
}
