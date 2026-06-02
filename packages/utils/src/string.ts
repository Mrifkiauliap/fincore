/**
 * Merapikan string menjadi format Title Case
 * Contoh: "alfamart jaya" -> "Alfamart Jaya"
 */
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
  );
}

/**
 * Menghapus spasi berlebih dan merapikan catatan
 */
export function sanitizeString(str: string): string {
  if (!str) return str;
  return str.trim().replace(/\s+/g, " ");
}

/**
 * Extract phone number from WhatsApp ID
 */
export function extractPhone(waId: string): string {
  // "628xxxxxxxxxx@c.us" > "628xxxxxxxxxx"
  // "247622363250777@lid" > "247622363250777"
  return waId
    .replace("@c.us", "")
    .replace("@g.us", "")
    .replace("@lid", "")
    .replace("@s.whatsapp.net", "");
}
