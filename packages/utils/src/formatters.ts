/**
 * Format angka menjadi format mata uang sesuai dengan kode mata uang (contoh: IDR, USD)
 * Contoh (IDR): 25000 -> "Rp 25.000"
 * Contoh (USD): 25 -> "$25.00"
 */
export function formatCurrency(
  amount: number | string,
  currencyCode: string = "IDR",
): string {
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return "0";

  const locale = currencyCode.toUpperCase() === "IDR" ? "id-ID" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

/**
 * Format label tipe transaksi untuk tampilan ke user
 */
export function getTransactionTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "expense":
      return "Pengeluaran";
    case "income":
      return "Pemasukan";
    case "transfer":
      return "Transfer";
    default:
      return "Transaksi";
  }
}
