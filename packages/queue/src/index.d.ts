import { JobsOptions, Queue } from "bullmq";
import { Redis } from "ioredis";
export declare function createValkeyConnection(): Redis;
export declare const defaultJobOptions: JobsOptions;
export declare function getQueue(name: string): Queue;
export declare function enqueue<T>(queueName: string, jobName: string, data: T, options?: JobsOptions): Promise<void>;
export declare function getAllQueues(): Queue[];
export { Queue, QueueEvents, Worker, WorkerOptions } from "bullmq";
export type { Job, JobsOptions } from "bullmq";
//# sourceMappingURL=index.d.ts.map