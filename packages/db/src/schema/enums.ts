import { pgEnum } from 'drizzle-orm/pg-core';

/** Tipe pesan WhatsApp yang diterima dari WAHA */
export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'voice',
  'image',
  'document',
  'video',
]);

/** Status pemrosesan pesan / job */
export const processingStatusEnum = pgEnum('processing_status', [
  'pending',
  'processing',
  'done',
  'failed',
  'skipped',
]);

/** Tipe transaksi keuangan */
export const transactionTypeEnum = pgEnum('transaction_type', [
  'expense',
  'income',
  'transfer',
]);

/** Tipe laporan keuangan */
export const reportTypeEnum = pgEnum('report_type', [
  'daily',
  'weekly',
  'monthly',
  'custom',
]);

/** Tipe metode pembayaran */
export const paymentMethodTypeEnum = pgEnum('payment_method_type', [
  'cash',
  'e_wallet',
  'bank_transfer',
  'credit_card',
  'debit_card',
  'qris',
  'other',
]);

/** Step pemrosesan AI per pesan */
export const processingStepEnum = pgEnum('processing_step', [
  'transcription',
  'ocr',
  'ai_extraction',
  'categorization',
  'notification',
]);
