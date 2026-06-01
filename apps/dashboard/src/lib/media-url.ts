/**
 * Obfuscated media URL utilities.
 *
 * Strategy: browser-safe base64url(storagePath) → `/api/media?p=...`
 * The endpoint validates session cookie before serving, so only
 * authenticated dashboard users can access media files.
 * The base64 encoding prevents casual URL guessing.
 *
 * Uses btoa/atob (browser-native) with manual base64url conversion,
 * NOT Buffer (Node.js-only) — this file is imported by client components.
 */

function toBase64url(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  // Convert standard base64 to base64url: + → -, / → _, strip =
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(encoded: string): string {
  // Convert base64url back to standard base64: - → +, _ → /
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Restore padding
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Build an obfuscated media URL from a storagePath (e.g. `local://uploads/image/uuid.jpg`).
 * Returns null if storagePath is falsy or not a valid local:// path.
 */
export function buildMediaUrl(
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  if (!storagePath.startsWith("local://uploads/")) return null;

  const encoded = toBase64url(storagePath);
  return `/api/media?p=${encoded}`;
}

/**
 * Decode an obfuscated `?p=` parameter back to a storagePath.
 * Returns null on invalid input.
 */
export function decodeMediaPath(encoded: string | null): string | null {
  if (!encoded) return null;
  try {
    const decoded = fromBase64url(encoded);
    if (!decoded.startsWith("local://uploads/")) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if a log type supports inline thumbnail/preview.
 */
export function isPreviewableType(type: string): boolean {
  return ["image", "video", "voice", "document"].includes(type);
}

/**
 * Get a placeholder gradient class for media types that don't have thumbnails.
 */
export function getMediaPlaceholderClass(type: string): string {
  switch (type) {
    case "image":
      return "from-blue-500/20 to-cyan-500/20";
    case "video":
      return "from-purple-500/20 to-pink-500/20";
    case "voice":
      return "from-amber-500/20 to-orange-500/20";
    case "document":
      return "from-emerald-500/20 to-teal-500/20";
    default:
      return "from-muted/30 to-muted/10";
  }
}
