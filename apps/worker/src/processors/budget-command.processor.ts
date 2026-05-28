import { BaseProcessor } from "@/processors/base.processor";
import { budgets, getDb, transactionCategories, users } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface BudgetCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

@Injectable()
export class BudgetCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.BUDGET_COMMAND;
  private readonly db = getDb();

  constructor() {
    super("worker:budget-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<BudgetCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_BUDGET_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    // 1. Get User
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);
    if (!user) {
      await this.sendReply(
        chatId,
        "Pengguna tidak ditemukan. Ketik pesan sapaan terlebih dahulu untuk registrasi.",
      );
      return;
    }

    // 2. Parse Command
    const parts = commandText.trim().split(/\s+/);
    // index 0 = "/budget"
    const action = parts[1]?.toLowerCase();

    switch (action) {
      case "set":
        await this.handleSetBudget(chatId, user, parts.slice(2));
        break;
      case "cek":
        await this.handleCheckBudget(chatId, user);
        break;
      case "hapus":
        await this.handleDeleteBudget(chatId, user, parts.slice(2));
        break;
      default:
        await this.sendReply(
          chatId,
          "❓ Perintah `/budget` tidak valid.\n\nContoh penggunaan:\n" +
            "• `/budget set makan 1000000` (Set batas budget)\n" +
            "• `/budget cek` (Lihat status budget bulan ini)\n" +
            "• `/budget hapus makan` (Hapus budget kategori tersebut)",
        );
    }
  }

  // ─── COMMAND HANDLERS ──────────────────────────────────────────────────

  private async handleSetBudget(chatId: string, user: any, args: string[]) {
    if (args.length < 2) {
      return this.sendReply(
        chatId,
        "⚠️ Format salah. Contoh: `/budget set makan 1000000`",
      );
    }

    // Ekstrak nominal dari argumen terakhir
    const amountStr = args.pop()!;
    const nominal = parseInt(amountStr.replace(/\D/g, ""), 10);
    if (isNaN(nominal) || nominal <= 0) {
      return this.sendReply(chatId, "⚠️ Nominal budget tidak valid.");
    }

    const categoryInput = args.join(" ");
    const category = await this.resolveExpenseCategory(categoryInput, user.id);

    if (!category) {
      return this.sendReply(
        chatId,
        `⚠️ Kategori pengeluaran "${categoryInput}" tidak ditemukan.`,
      );
    }

    const { month, year } = this.getCurrentPeriod(user.timezone);

    // Upsert budget
    const [existing] = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, user.id),
          eq(budgets.categoryId, category.id),
          eq(budgets.month, month),
          eq(budgets.year, year),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(budgets)
        .set({
          amount: nominal.toString(),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(budgets.id, existing.id));
    } else {
      await this.db.insert(budgets).values({
        userId: user.id,
        categoryId: category.id,
        amount: nominal.toString(),
        month,
        year,
      });
    }

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    await this.sendReply(
      chatId,
      `✅ Budget untuk kategori *${category.name}* berhasil diset ke ${formatter.format(nominal)} untuk bulan ini.`,
    );
  }

  private async handleCheckBudget(chatId: string, user: any) {
    const { month, year, monthName } = this.getCurrentPeriod(user.timezone);

    // Ambil semua budget aktif bulan ini
    const activeBudgets = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, user.id),
          eq(budgets.month, month),
          eq(budgets.year, year),
          eq(budgets.isActive, true),
        ),
      );

    if (activeBudgets.length === 0) {
      return this.sendReply(
        chatId,
        `ℹ️ Kamu belum menetapkan budget sama sekali untuk bulan ${monthName} ${year}. Ketik \`/budget set [kategori] [nominal]\` untuk mulai.`,
      );
    }

    // Ambil semua transaksi pengeluaran bulan ini
    const { sql } = await import("drizzle-orm");
    const { transactions } = await import("@fincore/db");
    const tz = user.timezone ?? "Asia/Jakarta";
    const now = dayjs().tz(tz);
    const periodStart = now.startOf("month").toDate();
    const periodEnd = now.endOf("month").toDate();

    const spendingData = await this.db
      .select({
        categoryId: transactions.categoryId,
        total:
          sql<number>`sum(CAST(${transactions.totalAmount} AS numeric))`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.type, "expense"),
          eq(transactions.isDeleted, false),
          gte(transactions.transactionDate, periodStart),
          lte(transactions.transactionDate, periodEnd),
        ),
      )
      .groupBy(transactions.categoryId);

    const spendingMap = new Map<string, number>();
    for (const s of spendingData) {
      if (s.categoryId) spendingMap.set(s.categoryId, s.total);
    }

    // Get categories names
    const catIds = activeBudgets.map((b) => b.categoryId);
    const { transactionCategories } = await import("@fincore/db");
    const cats = await this.db
      .select({
        id: transactionCategories.id,
        name: transactionCategories.name,
        icon: transactionCategories.icon,
      })
      .from(transactionCategories)
      .where(
        and(
          or(
            isNull(transactionCategories.userId),
            eq(transactionCategories.userId, user.id),
          ),
        ),
      );
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });

    let reply = `📊 *Status Budget Bulan ${monthName} ${year}*\n\n`;

    for (const budget of activeBudgets) {
      const cat = catMap.get(budget.categoryId);
      const name = cat ? `${cat.icon} ${cat.name}` : "Lainnya";
      const limit = Number(budget.amount);
      const spent = spendingMap.get(budget.categoryId) ?? 0;
      const percentage = (spent / limit) * 100;

      let statusIcon = "✅";
      if (percentage >= 100) statusIcon = "🚨 MELAMPAUI!";
      else if (percentage >= 80) statusIcon = "⚠️";

      reply += `*${name}*\nTerpakai: ${formatter.format(spent)} / ${formatter.format(limit)} (${percentage.toFixed(0)}%) ${statusIcon}\n\n`;
    }

    await this.sendReply(chatId, reply.trim());
  }

  private async handleDeleteBudget(chatId: string, user: any, args: string[]) {
    if (args.length === 0) {
      return this.sendReply(
        chatId,
        "⚠️ Kategori belum disebutkan. Contoh: `/budget hapus makan`",
      );
    }

    const categoryInput = args.join(" ");
    const category = await this.resolveExpenseCategory(categoryInput, user.id);

    if (!category) {
      return this.sendReply(
        chatId,
        `⚠️ Kategori pengeluaran "${categoryInput}" tidak ditemukan.`,
      );
    }

    const { month, year } = this.getCurrentPeriod(user.timezone);

    await this.db
      .update(budgets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(budgets.userId, user.id),
          eq(budgets.categoryId, category.id),
          eq(budgets.month, month),
          eq(budgets.year, year),
        ),
      );

    await this.sendReply(
      chatId,
      `🗑️ Budget untuk kategori *${category.name}* bulan ini berhasil dihapus.`,
    );
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  private async resolveExpenseCategory(input: string, userId: string) {
    const lower = input.toLowerCase().trim();
    const categories = await this.db
      .select({
        id: transactionCategories.id,
        name: transactionCategories.name,
      })
      .from(transactionCategories)
      .where(
        and(
          eq(transactionCategories.type, "expense"),
          eq(transactionCategories.isActive, true),
          or(
            isNull(transactionCategories.userId),
            eq(transactionCategories.userId, userId),
          ),
        ),
      );

    // 1. Exact match
    let match = categories.find((c) => c.name.toLowerCase() === lower);
    if (match) return match;

    // 2. Contains match
    match = categories.find(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        lower.includes(c.name.toLowerCase()),
    );
    if (match) return match;

    return null;
  }

  private getCurrentPeriod(timezone: string | null) {
    const tz = timezone ?? "Asia/Jakarta";
    const now = dayjs().tz(tz);
    return {
      month: now.month() + 1,
      year: now.year(),
      monthName: now.toDate().toLocaleDateString("id-ID", { month: "long" }),
    };
  }

  private async sendReply(chatId: string, text: string) {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
