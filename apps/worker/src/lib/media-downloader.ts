import getConfig from "@fincore/config";
import axios from "axios";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Download media from WAHA. Supports both absolute URLs and relative paths.
 * Shared by voice-transcription and image-ocr processors (DRY).
 *
 * Will throw on HTTP errors (404, etc.) — callers should catch.
 */
export async function downloadMedia(mediaUrl: string): Promise<Buffer> {
  let url = mediaUrl;

  if (url.startsWith("/")) {
    url = `${getConfig("WAHA_BASE_URL")}${url}`;
  }

  const response = await axios.get(url, {
    headers: { "X-Api-Key": getConfig("WAHA_API_KEY") },
    responseType: "arraybuffer",
    timeout: 60_000,
  });

  return Buffer.from(response.data);
}

/**
 * Read media from local storage via storagePath URI (e.g. "local://uploads/image/abc.jpg").
 * Returns the file buffer, or null if the file doesn't exist or URI format is wrong.
 */
export async function readMediaFromStorage(
  storagePath: string,
): Promise<Buffer | null> {
  if (!storagePath.startsWith("local://uploads/")) {
    return null;
  }

  const uploadDir =
    getConfig("LOCAL_UPLOAD_DIR") ?? resolve(process.cwd(), "../../uploads");
  const filename = storagePath.replace("local://uploads/", "");
  const filePath = resolve(uploadDir, filename);

  try {
    return await readFile(filePath);
  } catch {
    return null; // file doesn't exist or can't be read
  }
}
