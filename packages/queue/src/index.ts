import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { QueueName } from "@fincore/shared";
import { JobsOptions, Queue } from "bullmq";
import { Redis } from "ioredis";

const logger = createLogger("queue");

// ─── Valkey Connection ────────────────────────────────────────────────────────
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
    const connection = createValkeyConnection();
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

// ─── Re-exports ───────────────────────────────────────────────────────────────
export { Queue, QueueEvents, Worker, WorkerOptions } from "bullmq";
export type { Job, JobsOptions } from "bullmq";
