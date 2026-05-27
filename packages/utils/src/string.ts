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
