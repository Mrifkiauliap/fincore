"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Worker = exports.QueueEvents = exports.Queue = exports.defaultJobOptions = void 0;
exports.createValkeyConnection = createValkeyConnection;
exports.getQueue = getQueue;
exports.enqueue = enqueue;
exports.getAllQueues = getAllQueues;
const config_1 = __importDefault(require("@fincore/config"));
const logger_1 = require("@fincore/logger");
const shared_1 = require("@fincore/shared");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const logger = (0, logger_1.createLogger)("queue");
function createValkeyConnection() {
    const connection = new ioredis_1.Redis((0, config_1.default)("VALKEY_URL") ?? "redis://localhost:6379", {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });
    connection.on("connect", () => logger.info("✅ Valkey connected"));
    connection.on("error", (err) => logger.error({ err }, "Valkey error"));
    return connection;
}
exports.defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
};
const queues = new Map();
function getQueue(name) {
    if (!queues.has(name)) {
        const connection = createValkeyConnection();
        const queue = new bullmq_1.Queue(name, {
            connection,
            defaultJobOptions: exports.defaultJobOptions,
        });
        queues.set(name, queue);
        logger.info(`Queue created: ${name}`);
    }
    return queues.get(name);
}
async function enqueue(queueName, jobName, data, options) {
    const queue = getQueue(queueName);
    const job = await queue.add(jobName, data, {
        ...exports.defaultJobOptions,
        ...options,
    });
    logger.info({ jobId: job.id, queueName, jobName }, "Job enqueued");
}
function getAllQueues() {
    return Object.values(shared_1.QueueName).map((name) => getQueue(name));
}
var bullmq_2 = require("bullmq");
Object.defineProperty(exports, "Queue", { enumerable: true, get: function () { return bullmq_2.Queue; } });
Object.defineProperty(exports, "QueueEvents", { enumerable: true, get: function () { return bullmq_2.QueueEvents; } });
Object.defineProperty(exports, "Worker", { enumerable: true, get: function () { return bullmq_2.Worker; } });
//# sourceMappingURL=index.js.map