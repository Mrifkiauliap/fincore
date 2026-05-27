import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const logger = createLogger("storage");

export class StorageProvider {
  private readonly storageType: string;
  private readonly localUploadDir: string;

  constructor() {
    this.storageType = getConfig("STORAGE_TYPE") ?? "local";
    this.localUploadDir = resolve(process.cwd(), "../../uploads");
  }

  /**
   * Menyimpan file media secara lokal dan mengembalikan URL format `local://...`
   */
  async saveMedia(buffer: Buffer, mimetype: string): Promise<string> {
    const ext = this.getExtension(mimetype);
    const filename = `${randomUUID()}.${ext}`;

    // Determine sub-folder based on mimetype
    let subFolder = "misc";
    if (mimetype.startsWith("image/")) {
      subFolder = "image";
    } else if (mimetype.startsWith("audio/")) {
      subFolder = "audio";
    } else if (
      mimetype === "application/pdf" ||
      mimetype.includes("document")
    ) {
      subFolder = "document";
    }

    if (this.storageType === "s3") {
      // TODO: Implement S3 logic here when migrating
      logger.info("S3 storage not implemented yet, falling back to local");
    }

    // Local storage
    const targetDir = join(this.localUploadDir, subFolder);
    try {
      await mkdir(targetDir, { recursive: true });
    } catch (err) {
      // ignore error if directory exists
    }

    const filePath = join(targetDir, filename);
    await writeFile(filePath, buffer);

    logger.info({ filePath, size: buffer.length }, "Saved media locally");
    return `local://uploads/${subFolder}/${filename}`;
  }

  /**
   * Menghapus file media berdasarkan URI (hanya mendukung local:// saat ini)
   */
  async deleteMedia(uri: string): Promise<boolean> {
    if (!uri.startsWith("local://uploads/")) {
      logger.warn({ uri }, "Invalid or unsupported media URI for deletion");
      return false;
    }

    const filename = uri.replace("local://uploads/", "");
    const filePath = join(this.localUploadDir, filename);

    try {
      // Import rm from node:fs/promises at the top if not exists, but wait, we can just dynamically import or use fs/promises
      const { rm } = await import("node:fs/promises");
      await rm(filePath, { force: true });
      logger.info({ filePath }, "Deleted media file");
      return true;
    } catch (err: any) {
      logger.error({ err, filePath }, "Failed to delete media file");
      return false;
    }
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "audio/ogg; codecs=opus": "oga", // WAHA specific for voice notes
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "video/mp4": "mp4",
      "application/pdf": "pdf",
    };
    if (map[mimetype]) return map[mimetype];

    // Fallback simple parsing
    const parts = mimetype.split("/");
    return parts[1]?.split(";")[0] ?? "bin";
  }
}
