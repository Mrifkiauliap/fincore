import dayjs from "dayjs";
import "dayjs/locale/id";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/** Build the WhatsApp message for monthly report. */
export function buildMessage(params: {
  monthName: string;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  totalTransfer: number;
  closingBalance: number;
  topCategories: { categoryName: string; total: number; percentage: number }[];
  budgetSummaryStr: string;
  insight: string;
}): string {
  const {
    monthName,
    openingBalance,
    totalIncome,
    totalExpense,
    totalTransfer,
    closingBalance,
    topCategories,
    budgetSummaryStr,
    insight,
  } = params;

  const netSign = closingBalance >= openingBalance ? "+" : "";
  const netDiff = closingBalance - openingBalance;

  let messageStr = `*Laporan ${monthName}*\n\n`;

  messageStr += `Saldo Awal    : ${fmt.format(openingBalance)}\n`;
  messageStr += `Pemasukan     : ${fmt.format(totalIncome)}\n`;
  messageStr += `Pengeluaran   : ${fmt.format(totalExpense)}\n`;
  if (totalTransfer > 0) {
    messageStr += `Transfer      : ${fmt.format(totalTransfer)}\n`;
  }
  messageStr += `──────────────────────────\n`;
  messageStr += `Saldo Akhir   : *${fmt.format(closingBalance)}*`;
  messageStr += ` (${netSign}${fmt.format(netDiff)})\n`;

  if (topCategories.length > 0) {
    messageStr += `\n*Pengeluaran Terbesar:*\n`;
    for (const cat of topCategories) {
      const bar = "█".repeat(Math.round(cat.percentage / 10)).padEnd(10, "░");
      messageStr += `${cat.categoryName}\n${bar} ${fmt.format(cat.total)} (${cat.percentage.toFixed(0)}%)\n`;
    }
  }

  if (budgetSummaryStr) {
    messageStr += `\n${budgetSummaryStr}`;
  }

  if (insight) {
    messageStr += `\n${insight}`;
  }

  return messageStr;
}
