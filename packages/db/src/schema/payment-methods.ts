import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { paymentMethodTypeEnum } from "./enums";
import { users } from "./users";

/**
 * Tabel referensi metode pembayaran.
 * userId = NULL berarti data global/default (seeded).
 * userId terisi berarti metode custom milik user tersebut.
 */
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = global default, terisi = custom milik user */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: paymentMethodTypeEnum("type").notNull(),
    /** Emoji atau icon identifier, contoh: "💳", "📱" */
    icon: text("icon"),
    /** Hex color untuk UI */
    color: text("color"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_payment_methods_user_id").on(t.userId),
    index("idx_payment_methods_type").on(t.type),
  ],
);

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
