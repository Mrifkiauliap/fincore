import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { reportTypeEnum } from "./enums";
import { users } from "./users";

/**
 * Interface untuk struktur data laporan keuangan.
 * Digunakan sebagai type untuk kolom `data` jsonb.
 */
export interface ReportData {
  totalIncome: number;
  totalExpense: number;
  totalTransfer: number;
  netBalance: number;
  currency: string;
  breakdown: {
    categoryId: string | null;
    categoryName: string;
    type: string;
    total: number;
    count: number;
  }[];
  topMerchants?: { merchant: string; total: number; count: number }[];
  topCategories?: { categoryName: string; total: number; percentage: number }[];
  transactionCount: number;
}

/**
 * Tabel penyimpanan laporan keuangan yang sudah di-generate.
 * Di-cache agar tidak perlu recompute setiap request.
 * sentAt null berarti laporan belum dikirim ke WhatsApp.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: reportTypeEnum("type").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    /** Teks laporan yang dikirim ke WhatsApp */
    summary: text("summary"),
    /** Raw data laporan: breakdown, totals, dll */
    data: jsonb("data").$type<ReportData>().notNull(),
    /** Waktu laporan dikirim ke WA. Null = belum dikirim */
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_reports_user_id_type_period").on(
      t.userId,
      t.type,
      t.periodStart,
    ),
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
