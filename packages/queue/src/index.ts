import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { JobName, QueueName } from "@fincore/shared";
import { JobsOptions, Queue } from "bullmq";
import { Redis } from "ioredis";

const logger = createLogger("queue");

// ─── Shared Valkey Connection Singleton ────────────────────────────────────────
let _sharedValkey: Redis | null = null;

export function createValkeyConnection(): Redis {
  const connection = new Redis(
    getConfig("VALKEY_URL") ?? "redis://localhost:6379",
    {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  );

  connection.on("connect", () => logger.info("✅ Valkey connected"));
  connection.on("error", (err) => logger.error({ err }, "Valkey error"));

  return connection;
}

/**
 * Returns a shared Valkey connection singleton.
 * All consumers (processors, services, guards) should use this
 * instead of calling createValkeyConnection() individually.
 */
export function getSharedValkey(): Redis {
  if (!_sharedValkey) {
    _sharedValkey = createValkeyConnection();
  }
  return _sharedValkey;
}

/**
 * Close the shared Valkey connection (graceful shutdown).
 */
export async function closeSharedValkey(): Promise<void> {
  if (_sharedValkey) {
    await _sharedValkey.quit();
    _sharedValkey = null;
    logger.info("Shared Valkey connection closed");
  }
}

// ─── Default Job Options ──────────────────────────────────────────────────────
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

// ─── Queue Factory ────────────────────────────────────────────────────────────
const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const connection = getSharedValkey();
    const queue = new Queue(name, {
      connection,
      defaultJobOptions,
    });
    queues.set(name, queue);
    logger.info(`Queue created: ${name}`);
  }
  return queues.get(name)!;
}

// ─── Enqueue Helper ───────────────────────────────────────────────────────────
export async function enqueue<T>(
  queueName: string,
  jobName: string,
  data: T,
  options?: JobsOptions,
): Promise<void> {
  const queue = getQueue(queueName);
  const job = await queue.add(jobName, data, {
    ...defaultJobOptions,
    ...options,
  });
  logger.info({ jobId: job.id, queueName, jobName }, "Job enqueued");
}

// ─── All Queues (for BullBoard) ───────────────────────────────────────────────
export function getAllQueues(): Queue[] {
  return Object.values(QueueName).map((name) => getQueue(name));
}

// ─── Message Helpers (self-catching — never throw) ────────────────────────────
export async function sendWaMessage(
  chatId: string,
  text: string,
  replyTo?: string,
): Promise<void> {
  try {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
      replyTo,
    });
  } catch (err) {
    logger.error({ err, chatId }, "sendWaMessage failed");
  }
}

export async function sendWaImage(
  chatId: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  try {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_IMAGE, {
      chatId,
      imageUrl,
      caption,
    });
  } catch (err) {
    logger.error({ err, chatId }, "sendWaImage failed");
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────
export { Queue, QueueEvents, Worker } from "bullmq";
export type { Job, JobsOptions, WorkerOptions } from "bullmq";
