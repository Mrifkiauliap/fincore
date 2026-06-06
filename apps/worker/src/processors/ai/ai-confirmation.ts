import { AiExtractionOutput } from "@fincore/contracts";
import { formatCurrency, getTransactionTypeLabel } from "@fincore/utils";

/**
 * Build a one-line summary for a single extracted transaction.
 * Format: *Nama* - Rp X.XXX\n_Tipe · Merchant · Metode · #tag_
 */
export function buildTransactionSummaryLine(
  extracted: AiExtractionOutput,
): string {
  const typeLabel = getTransactionTypeLabel(extracted.type);
  const amountStr = formatCurrency(extracted.total_amount, "IDR");
  const itemName = extracted.name ?? "Transaksi";

  let line = `*${itemName}* - ${amountStr}`;

  const details: string[] = [typeLabel];
  if (extracted.merchant) details.push(extracted.merchant);
  if (extracted.payment_method) details.push(`via ${extracted.payment_method}`);
  if (extracted.tags && extracted.tags.length > 0) {
    details.push(extracted.tags.map((t) => `#${t.trim()}`).join(" "));
  }

  line += `\n_${details.join(" · ")}_`;
  return line;
}

/**
 * Build the confirmation/reply message sent to the user after AI extraction.
 */
export function buildReply(
  savedSummaries: string[],
  pendingSummaries: string[],
  savedCount: number,
  pendingCount: number,
  pendingReasons: (
    | "low_confidence"
    | "suspicious_amount"
    | "missing_payment_method"
  )[] = [],
): string {
  const lines: string[] = [];

  const hasSuspicious = pendingReasons.includes("suspicious_amount");
  const hasMissingMethod = pendingReasons.includes("missing_payment_method");

  let confirmationNote = "Perlu konfirmasi dulu:";
  if (hasSuspicious) {
    confirmationNote =
      "Nominal dari gambar tampak tidak wajar, mohon konfirmasi:";
  } else if (hasMissingMethod) {
    confirmationNote =
      "Metode pembayaran belum diisi, mohon lengkapi (balas dengan nama metode pembayarannya) atau konfirmasi:";
  }

  if (savedCount > 0 && pendingCount === 0) {
    if (savedCount === 1) {
      lines.push("Tercatat.", "", ...savedSummaries);
    } else {
      lines.push(`${savedCount} transaksi tercatat:`, "");
      savedSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
  } else if (pendingCount > 0 && savedCount === 0) {
    lines.push(confirmationNote, "");
    pendingSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("", "Balas *ya* untuk simpan, *tidak* untuk batalkan.");
  } else {
    if (savedCount > 0) {
      lines.push(`${savedCount} transaksi tersimpan:`);
      savedSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("");
    }
    lines.push(confirmationNote, "");
    pendingSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("", "Balas *ya* untuk simpan, *tidak* untuk batalkan.");
  }

  return lines.join("\n");
}

/** Error reply when AI fails to extract transactions. */
export function getExtractionErrorReply(): string {
  return (
    `Maaf, aku tidak bisa memahami transaksi itu.\n\n` +
    `Coba format seperti:\n` +
    `• _"Makan siang 25rb gopay"_\n` +
    `• _"Bayar listrik 150rb transfer BCA"_\n` +
    `• _"Terima gaji 5jt"_\n` +
    `• _"Tf ke OVO 100rb dari Dana, admin 1rb"_`
  );
}
