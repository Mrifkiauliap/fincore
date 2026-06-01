import { relations } from "drizzle-orm";
import { aiProcessingLogs } from "./ai-processing-logs";
import { budgets } from "./budgets";
import { paymentMethods } from "./payment-methods";
import { rawAiOutputs } from "./raw-ai-outputs";
import { rawMessages } from "./raw-messages";
import { recurringBills } from "./recurring-bills";
import { transactionCategories } from "./transaction-categories";
import { transactionTagMappings } from "./transaction-tag-mappings";
import { transactionTags } from "./transaction-tags";
import { transactions } from "./transactions";
import { users } from "./users";

export const rawMessagesRelations = relations(rawMessages, ({ many }) => ({
  aiOutputs: many(rawAiOutputs),
  processingLogs: many(aiProcessingLogs),
}));

export const rawAiOutputsRelations = relations(rawAiOutputs, ({ one }) => ({
  rawMessage: one(rawMessages, {
    fields: [rawAiOutputs.rawMessageId],
    references: [rawMessages.id],
  }),
}));

export const aiProcessingLogsRelations = relations(
  aiProcessingLogs,
  ({ one }) => ({
    rawMessage: one(rawMessages, {
      fields: [aiProcessingLogs.rawMessageId],
      references: [rawMessages.id],
    }),
  }),
);

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [transactions.userId],
      references: [users.id],
    }),
    rawMessage: one(rawMessages, {
      fields: [transactions.rawMessageId],
      references: [rawMessages.id],
    }),
    category: one(transactionCategories, {
      fields: [transactions.categoryId],
      references: [transactionCategories.id],
    }),
    paymentMethod: one(paymentMethods, {
      fields: [transactions.paymentMethodId],
      references: [paymentMethods.id],
    }),
    toPaymentMethod: one(paymentMethods, {
      fields: [transactions.toPaymentMethodId],
      references: [paymentMethods.id],
    }),
    tags: many(transactionTagMappings),
  }),
);

export const transactionTagsRelations = relations(
  transactionTags,
  ({ many }) => ({
    transactions: many(transactionTagMappings),
  }),
);

export const transactionTagMappingsRelations = relations(
  transactionTagMappings,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [transactionTagMappings.transactionId],
      references: [transactions.id],
    }),
    tag: one(transactionTags, {
      fields: [transactionTagMappings.tagId],
      references: [transactionTags.id],
    }),
  }),
);

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(transactionCategories, {
    fields: [budgets.categoryId],
    references: [transactionCategories.id],
  }),
}));

export const recurringBillsRelations = relations(recurringBills, ({ one }) => ({
  category: one(transactionCategories, {
    fields: [recurringBills.categoryId],
    references: [transactionCategories.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [recurringBills.paymentMethodId],
    references: [paymentMethods.id],
  }),
}));
