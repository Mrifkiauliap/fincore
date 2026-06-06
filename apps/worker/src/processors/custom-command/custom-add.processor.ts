import {
  getDb,
  paymentMethods,
  paymentMethodTypeEnum,
  transactionCategories,
} from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { and, eq } from "drizzle-orm";

/**
 * Handles /tambah metode [name] [type?] and /tambah kategori [name] [type?]
 */
export async function handleAddCommand(
  chatId: string,
  userId: string,
  prefix: string,
  lower: string,
  commandText: string,
): Promise<boolean> {
  const db = getDb();

  // /tambah metode
  if (lower.startsWith(prefix + "tambah metode ")) {
    const rest = commandText.slice((prefix + "tambah metode ").length).trim();
    await addPaymentMethod(db, chatId, userId, rest, prefix);
    return true;
  }

  // /tambah kategori
  if (lower.startsWith(prefix + "tambah kategori ")) {
    const rest = commandText.slice((prefix + "tambah kategori ").length).trim();
    await addCategory(db, chatId, userId, rest, prefix);
    return true;
  }

  return false;
}

async function addPaymentMethod(
  db: ReturnType<typeof getDb>,
  chatId: string,
  userId: string,
  rest: string,
  prefix: string,
) {
  const parts = rest.trim().split(/\s+/);
  const typeRaw = parts[parts.length - 1]?.toLowerCase() ?? "";

  const validTypesMap: Record<string, string> = {
    cash: "cash",
    tunai: "cash",
    ewallet: "e_wallet",
    e_wallet: "e_wallet",
    bank: "bank_transfer",
    transfer: "bank_transfer",
    kredit: "credit_card",
    credit: "credit_card",
    cc: "credit_card",
    debit: "debit_card",
    qris: "qris",
    lainnya: "other",
    other: "other",
  };

  let type = "other";
  let nameParts = parts;

  if (validTypesMap[typeRaw]) {
    type = validTypesMap[typeRaw];
    nameParts = parts.slice(0, -1);
  } else {
    const full = rest.toLowerCase();
    if (
      /bca|bni|bri|mandiri|bsi|jago|jenius|bank|tabungan|rekening/.test(full)
    ) {
      type = "bank_transfer";
    } else if (/gopay|ovo|dana|shopeepay|spay|linkaja|wallet/.test(full)) {
      type = "e_wallet";
    } else if (/cash|tunai|dompet/.test(full)) {
      type = "cash";
    } else if (/kredit|cc|paylater/.test(full)) {
      type = "credit_card";
    } else if (/debit/.test(full)) {
      type = "debit_card";
    } else if (/qris/.test(full)) {
      type = "qris";
    }
  }

  const name = nameParts.join(" ").trim();
  if (!name || name.length < 2) {
    return sendWaMessage(
      chatId,
      `⚠️ Nama terlalu pendek. Contoh: \`${prefix}tambah metode BCA Tabungan\` atau \`${prefix}tambah metode Uang Tunai cash\``,
    );
  }

  const [existing] = await db
    .select()
    .from(paymentMethods)
    .where(
      and(eq(paymentMethods.userId, userId), eq(paymentMethods.name, name)),
    )
    .limit(1);

  if (existing) {
    return sendWaMessage(chatId, `⚠️ Metode pembayaran *${name}* sudah ada.`);
  }

  let icon = "💳";
  if (type === "cash") icon = "💵";
  else if (type === "e_wallet") icon = "📱";
  else if (type === "bank_transfer") icon = "🏦";
  else if (type === "qris") icon = "📲";

  await db.insert(paymentMethods).values({
    userId,
    name,
    type: type as (typeof paymentMethodTypeEnum.enumValues)[number],
    icon,
    isActive: true,
  });

  await sendWaMessage(
    chatId,
    `✅ Metode pembayaran *${name}* (${type.replace("_", " ")}) berhasil ditambahkan.`,
  );
}

async function addCategory(
  db: ReturnType<typeof getDb>,
  chatId: string,
  userId: string,
  rest: string,
  prefix: string,
) {
  const parts = rest.trim().split(/\s+/);
  const typeRaw = parts[parts.length - 1]?.toLowerCase();
  const validTypes = ["expense", "income", "transfer"];

  let type: "expense" | "income" | "transfer";
  let nameParts: string[];

  if (validTypes.includes(typeRaw)) {
    type = typeRaw as "expense" | "income" | "transfer";
    nameParts = parts.slice(0, -1);
  } else {
    type = "expense";
    nameParts = parts;
  }

  const name = nameParts.join(" ").trim();
  if (!name || name.length < 2) {
    return sendWaMessage(
      chatId,
      `⚠️ Format salah. Contoh: \`${prefix}tambah kategori Langganan Streaming expense\``,
    );
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");

  const [existing] = await db
    .select()
    .from(transactionCategories)
    .where(
      and(
        eq(transactionCategories.userId, userId),
        eq(transactionCategories.slug, slug),
        eq(transactionCategories.type, type),
      ),
    )
    .limit(1);

  if (existing) {
    return sendWaMessage(
      chatId,
      `⚠️ Kategori *${name}* untuk tipe *${type}* sudah ada.`,
    );
  }

  await db.insert(transactionCategories).values({
    userId,
    name,
    slug,
    type,
    icon: type === "expense" ? "💸" : type === "income" ? "💰" : "🔄",
    isDefault: false,
    isActive: true,
    sortOrder: 99,
  });

  const typeLabel =
    type === "expense"
      ? "pengeluaran"
      : type === "income"
        ? "pemasukan"
        : "transfer";
  await sendWaMessage(
    chatId,
    `✅ Kategori *${name}* (${typeLabel}) berhasil ditambahkan.`,
  );
}
