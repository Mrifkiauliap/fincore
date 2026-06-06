import getConfig from "@fincore/config";
import axios from "axios";

/**
 * Download media from WAHA. Supports both absolute URLs and relative paths.
 * Shared by voice-transcription and image-ocr processors (DRY).
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
