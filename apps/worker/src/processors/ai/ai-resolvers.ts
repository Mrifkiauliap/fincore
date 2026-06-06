import getConfig from "@fincore/config";
import {
  getDb as db,
  paymentMethods,
  transactionCategories,
  transactionTags,
} from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { toTitleCase } from "@fincore/utils";
import axios from "axios";
import { and, eq, ilike, isNull, or } from "drizzle-orm";

const logger = createLogger("processor:ai-resolvers");

/**
 * Resolve a category slug to its database ID for a given user.
 * Falls back to "other_expense" / "other_income" / "transfer_account".
 */
export async function resolveCategory(
  categorySlug: string,
  transactionType: string,
  userId: string,
): Promise<string | null> {
  const rows = await db()
    .select({
      id: transactionCategories.id,
      userId: transactionCategories.userId,
    })
    .from(transactionCategories)
    .where(
      and(
        ilike(transactionCategories.slug, categorySlug),
        eq(
          transactionCategories.type,
          transactionType as "expense" | "income" | "transfer",
        ),
        or(
          isNull(transactionCategories.userId),
          eq(transactionCategories.userId, userId),
        ),
      ),
    )
    .limit(2);

  const found = rows.find((r) => r.userId === userId) ?? rows[0];
  if (found) return found.id;

  const fallbackSlug =
    transactionType === "income"
      ? "other_income"
      : transactionType === "transfer"
        ? "transfer_account"
        : "other_expense";

  const [fallback] = await db()
    .select({ id: transactionCategories.id })
    .from(transactionCategories)
    .where(
      and(
        eq(transactionCategories.slug, fallbackSlug),
        isNull(transactionCategories.userId),
      ),
    )
    .limit(1);

  return fallback?.id ?? null;
}

/**
 * Resolve an array of tag names to tag IDs, auto-creating any that don't exist.
 */
export async function resolveTags(
  tagsFromAi: string[],
  userId: string,
): Promise<string[]> {
  if (!tagsFromAi || tagsFromAi.length === 0) return [];

  const tagIds: string[] = [];
  for (const rawTag of tagsFromAi) {
    const cleanTag = rawTag.trim();
    if (!cleanTag) continue;

    const [existingTag] = await db()
      .select({ id: transactionTags.id })
      .from(transactionTags)
      .where(
        and(
          eq(transactionTags.userId, userId),
          ilike(transactionTags.name, cleanTag),
        ),
      )
      .limit(1);

    if (existingTag) {
      tagIds.push(existingTag.id);
    } else {
      const [newTag] = await db()
        .insert(transactionTags)
        .values({ userId, name: toTitleCase(cleanTag) })
        .returning({ id: transactionTags.id });

      tagIds.push(newTag.id);
    }
  }

  return tagIds;
}

/**
 * Resolve a payment method name (from AI) to its database ID.
 * Uses fuzzy matching first, then falls back to AI disambiguation.
 */
export async function resolvePaymentMethod(
  nameFromAi: string,
  userId: string,
): Promise<string | null> {
  const allMethods = await db()
    .select({ id: paymentMethods.id, name: paymentMethods.name })
    .from(paymentMethods)
    .where(
      or(isNull(paymentMethods.userId), eq(paymentMethods.userId, userId)),
    );

  const lower = nameFromAi.toLowerCase().trim();

  let match = allMethods.find((m) => m.name.toLowerCase() === lower);
  if (match) return match.id;

  match = allMethods.find(
    (m) =>
      m.name.toLowerCase().includes(lower) ||
      lower.includes(m.name.toLowerCase()),
  );
  if (match) {
    logger.debug(
      { nameFromAi, matched: match.name },
      "Fuzzy payment method match",
    );
    return match.id;
  }

  logger.info(
    { nameFromAi },
    "No fuzzy match, asking AI to disambiguate payment method",
  );
  const methodList = allMethods.map((m) => m.name).join(", ");
  const aiPick = await askAiForPaymentMethod(nameFromAi, methodList);

  if (aiPick) {
    const aiMatch = allMethods.find((m) => m.name === aiPick);
    if (aiMatch) {
      logger.info({ nameFromAi, aiPick }, "AI disambiguated payment method");
      return aiMatch.id;
    }
  }

  logger.warn({ nameFromAi }, "Payment method not resolved by AI either");
  return null;
}

async function askAiForPaymentMethod(
  nameFromAi: string,
  availableList: string,
): Promise<string | null> {
  try {
    const res = await axios.post(
      `${getConfig("SUMOPOD_BASE_URL")}/chat/completions`,
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah classifier metode pembayaran. " +
              "Pilih satu nama dari daftar yang paling cocok dengan input user. " +
              'Balas HANYA dengan nama persis dari daftar, atau "NONE" jika tidak ada yang cocok.',
          },
          {
            role: "user",
            content: `Input: "${nameFromAi}"\nDaftar: ${availableList}`,
          },
        ],
        temperature: 0,
        max_tokens: 32,
      },
      {
        headers: {
          Authorization: `Bearer ${getConfig("SUMOPOD_API_KEY")}`,
          "Content-Type": "application/json",
        },
        timeout: 8_000,
      },
    );

    const answer: string = res.data.choices[0].message.content.trim();
    return answer === "NONE" ? null : answer;
  } catch (err) {
    logger.warn({ err }, "AI payment method disambiguation failed");
    return null;
  }
}
